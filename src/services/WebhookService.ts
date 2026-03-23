/**
 * Webhook Service - Business Logic
 * 
 * Handles Stripe webhook events with proper deduplication and status updates
 */

import Stripe from 'stripe';
import { supabase } from '../config/supabase';

export interface WebhookResult {
  success: boolean;
  data?: any;
  error?: string;
  code?: string; // Add error code for distinction
}

export class WebhookService {

  /**
   * Check if event was already processed
   */
  static async checkEventProcessed(eventId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('stripe_events')
        .select('id, processed_at')
        .eq('stripe_event_id', eventId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('❌ WebhookService: Error checking event:', error);
        return false;
      }

      return !!data && !!data.processed_at;
    } catch (error) {
      console.error('❌ WebhookService: Unexpected error checking event:', error);
      return false;
    }
  }


  /**
   * Process event with proper deduplication flow
   */
  static async processEventWithDeduplication(event: Stripe.Event): Promise<WebhookResult> {
    try {
      // 1. Try to claim processing with real event data (prevents race conditions)
      const claimResult = await this.claimEventProcessing(event);
      if (!claimResult.success) {
        if (claimResult.code === 'already_claimed') {
          // Event already exists - check if processed
          const existingEvent = await this.checkEventProcessed(event.id);
          if (existingEvent) {
            return { success: true, data: { ignored: true, reason: 'Already processed' } };
          } else {
            return { success: true, data: { ignored: true, reason: 'Already being processed' } };
          }
        } else {
          // Real error - don't mask it
          return { success: false, error: claimResult.error, code: 'claim_failed' };
        }
      }

      // 2. Process the event
      const result = await this.processEvent(event);

      // 3. Mark as processed if successful
      if (result.success) {
        await this.markEventProcessed(event.id, result.data);
      } else {
        await this.markEventError(event.id, result.error || 'Unknown error');
      }

      return result;
    } catch (error) {
      console.error(`❌ WebhookService: Error processing ${event.type}:`, error);
      await this.markEventError(event.id, error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'processing_failed'
      };
    }
  }

  /**
   * Claim event processing with real event data (prevent race conditions)
   */
  private static async claimEventProcessing(event: Stripe.Event): Promise<WebhookResult> {
    try {
      const eventData = {
        stripe_event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        api_version: event.api_version,
        payload: event as any, // Store REAL event data
        metadata: {
          created: event.created,
          object: event.object,
          processing_started_at: new Date().toISOString()
        }
      };

      // Try to insert real event data - if exists, someone else claimed it
      const { error } = await supabase
        .from('stripe_events')
        .insert(eventData);

      if (error) {
        if (error.code === '23505') { // Unique violation
          return { success: false, error: 'Event already claimed', code: 'already_claimed' };
        }
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('❌ WebhookService: Failed to claim event:', error);
      return { success: false, error: 'Failed to claim event' };
    }
  }

  /**
   * Mark event as processed
   */
  private static async markEventProcessed(eventId: string, resultData: any): Promise<void> {
    try {
      await supabase
        .from('stripe_events')
        .update({
          processed_at: new Date().toISOString(),
          organization_id: resultData?.organization_id,
          booking_id: resultData?.booking_id,
          booking_payment_id: resultData?.payment_id
        })
        .eq('stripe_event_id', eventId);
    } catch (error) {
      console.error('❌ WebhookService: Failed to mark event processed:', error);
    }
  }

  /**
   * Mark event with error (DON'T set processed_at to allow retry)
   */
  private static async markEventError(eventId: string, errorMessage: string): Promise<void> {
    try {
      await supabase
        .from('stripe_events')
        .update({
          processing_error: errorMessage,
          failed_at: new Date().toISOString() // Use failed_at instead of processed_at
        })
        .eq('stripe_event_id', eventId);
    } catch (error) {
      console.error('❌ WebhookService: Failed to mark event error:', error);
    }
  }
  static async processEvent(event: Stripe.Event): Promise<WebhookResult> {
    try {
      switch (event.type) {
        // Primary payment events
        case 'payment_intent.succeeded':
          return await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);

        case 'payment_intent.payment_failed':
          return await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);

        case 'payment_intent.canceled':
          return await this.handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);

        // Secondary events (for fee calculation)
        case 'charge.succeeded':
          return await this.handleChargeSucceeded(event.data.object as Stripe.Charge);

        // Ignored events
        case 'payment_intent.created':
        case 'payment_intent.requires_action':
        case 'payment_intent.processing':
          console.log(`ℹ️ WebhookService: Ignoring event ${event.type}`);
          return { success: true, data: { ignored: true, reason: 'Not a final status' } };

        default:
          console.log(`⚠️ WebhookService: Unhandled event type ${event.type}`);
          return { success: true, data: { ignored: true, reason: 'Event type not handled' } };
      }
    } catch (error) {
      console.error(`❌ WebhookService: Error processing ${event.type}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle payment_intent.succeeded
   */
  private static async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<WebhookResult> {
    try {
      console.log(`💰 WebhookService: Processing payment_intent.succeeded: ${paymentIntent.id}`);

      // 1. Find payment record
      const paymentRecord = await this.findPaymentRecord(paymentIntent.id);
      if (!paymentRecord) {
        return { success: false, error: 'Payment record not found' };
      }

      // 2. Calculate Stripe fees (ESTIMATION ONLY for logging - NOT saved to DB)
      // Real fee will come from charge.succeeded webhook
      const estimatedStripeFee = Math.round(paymentIntent.amount * 0.014) + 20;
      console.log(`💰 WebhookService: Estimated fee for payment ${paymentIntent.id}: ${estimatedStripeFee}p (real fee will come from charge.succeeded)`);

      // 3. Update payment record (defensive - only if not already succeeded)
      const { error: paymentError } = await supabase
        .from('booking_payments')
        .update({
          status: 'succeeded',
          // Don't save fee estimation - real fee will come from charge.succeeded
          stripe_charge_id: (typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id) || null,
          captured_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRecord.id)
        .neq('status', 'succeeded'); // Only update if not already succeeded

      if (paymentError) {
        return { success: false, error: 'Failed to update payment record' };
      }

      // 4. Update booking status to CONFIRMED (defensive - only if PENDING_PAYMENT)
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          status: 'CONFIRMED',
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRecord.booking_id)
        .eq('status', 'PENDING_PAYMENT'); // Only update if still pending

      if (bookingError) {
        console.error('⚠️ WebhookService: Failed to update booking status:', bookingError);
        // Don't fail the webhook, but log the error
      }

      console.log(`✅ WebhookService: Payment succeeded - Booking ${paymentRecord.booking_id} CONFIRMED`);

      return {
        success: true,
        data: {
          payment_id: paymentRecord.id,
          booking_id: paymentRecord.booking_id,
          organization_id: paymentRecord.organization_id,
          status: 'CONFIRMED',
          amount: paymentIntent.amount
          // Fee will be set by charge.succeeded webhook
        }
      };

    } catch (error) {
      console.error('❌ WebhookService: Error in handlePaymentIntentSucceeded:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle payment_intent.payment_failed
   */
  private static async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<WebhookResult> {
    try {
      console.log(`❌ WebhookService: Processing payment_intent.payment_failed: ${paymentIntent.id}`);

      // 1. Find payment record
      const paymentRecord = await this.findPaymentRecord(paymentIntent.id);
      if (!paymentRecord) {
        return { success: false, error: 'Payment record not found' };
      }

      // 2. Extract error message
      const lastError = paymentIntent.last_payment_error?.message || 'Payment failed';

      // 3. Update payment record (defensive - only if not already in final status)
      const { error: paymentError } = await supabase
        .from('booking_payments')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          last_error: lastError,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRecord.id)
        .in('status', ['pending', 'processing']); // Only update if not already final

      if (paymentError) {
        return { success: false, error: 'Failed to update payment record' };
      }

      console.log(`ℹ️ WebhookService: Payment ${paymentRecord.id} marked as failed (may have been already failed)`);

      // 4. Update booking status to PAYMENT_FAILED (defensive - only if PENDING_PAYMENT)
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          status: 'PAYMENT_FAILED',
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRecord.booking_id)
        .eq('status', 'PENDING_PAYMENT'); // Only update if still pending

      if (bookingError) {
        console.error('⚠️ WebhookService: Failed to update booking status:', bookingError);
      }

      // 5. Event references are already set by markEventProcessed()
      console.log(`❌ WebhookService: Payment failed - Booking ${paymentRecord.booking_id} PAYMENT_FAILED`);

      return {
        success: true,
        data: {
          payment_id: paymentRecord.id,
          booking_id: paymentRecord.booking_id,
          organization_id: paymentRecord.organization_id,
          status: 'PAYMENT_FAILED',
          error: lastError
        }
      };

    } catch (error) {
      console.error('❌ WebhookService: Error in handlePaymentIntentFailed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle payment_intent.canceled
   */
  private static async handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<WebhookResult> {
    try {
      console.log(`🚫 WebhookService: Processing payment_intent.canceled: ${paymentIntent.id}`);

      // 1. Find payment record
      const paymentRecord = await this.findPaymentRecord(paymentIntent.id);
      if (!paymentRecord) {
        return { success: false, error: 'Payment record not found' };
      }

      // 3. Update payment record (defensive - only if not already in final status)
      const { error: paymentError } = await supabase
        .from('booking_payments')
        .update({
          status: 'canceled', // DB enum is 'canceled' (without L)
          canceled_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRecord.id)
        .in('status', ['pending', 'processing']); // Only update if not already final

      if (paymentError) {
        return { success: false, error: 'Failed to update payment record' };
      }

      console.log(`ℹ️ WebhookService: Payment ${paymentRecord.id} marked as canceled (may have been already canceled)`);

      // 4. Update booking status to CANCELLED (defensive - only if PENDING_PAYMENT)
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          status: 'CANCELLED',
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRecord.booking_id)
        .eq('status', 'PENDING_PAYMENT'); // Only update if still pending

      if (bookingError) {
        console.error('⚠️ WebhookService: Failed to update booking status:', bookingError);
      }

      // 5. Event references are already set by markEventProcessed()
      console.log(`🚫 WebhookService: Payment canceled - Booking ${paymentRecord.booking_id} CANCELLED`);

      return {
        success: true,
        data: {
          payment_id: paymentRecord.id,
          booking_id: paymentRecord.booking_id,
          organization_id: paymentRecord.organization_id,
          status: 'CANCELLED' // Booking status uses DB enum 'CANCELLED'
        }
      };

    } catch (error) {
      console.error('❌ WebhookService: Error in handlePaymentIntentCanceled:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle charge.succeeded (for fee confirmation)
   */
  private static async handleChargeSucceeded(charge: Stripe.Charge): Promise<WebhookResult> {
    try {
      console.log(`💳 WebhookService: Processing charge.succeeded: ${charge.id}`);

      // Find payment record by payment intent ID (more reliable than charge ID)
      const { data: paymentRecord, error } = await supabase
        .from('booking_payments')
        .select('id, booking_id, organization_id, stripe_payment_intent_id')
        .eq('stripe_payment_intent_id', charge.payment_intent)
        .single();

      if (error || !paymentRecord) {
        console.log(`ℹ️ WebhookService: Payment intent ${charge.payment_intent} not found in payments, possibly already processed`);
        return { success: true, data: { ignored: true, reason: 'Charge not associated with payment record' } };
      }

      // Update fee information only if we can get actual fee
      let updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (typeof charge.balance_transaction !== 'string' && charge.balance_transaction?.fee) {
        // We have actual fee data
        updateData.stripe_fee_pence = charge.balance_transaction.fee;
        updateData.net_amount_pence = charge.amount - charge.balance_transaction.fee;
        console.log(`💳 WebhookService: Updated actual fee ${charge.balance_transaction.fee} for payment ${paymentRecord.id}`);
      } else {
        // Balance transaction is just an ID, we can't get fee without API call
        // TODO: Fetch balance transaction object in future
        console.log(`💳 WebhookService: Balance transaction not expanded, keeping existing fee for payment ${paymentRecord.id}`);
      }

      await supabase
        .from('booking_payments')
        .update(updateData)
        .eq('id', paymentRecord.id);

      console.log(`✅ WebhookService: Updated fee information for payment ${paymentRecord.id}`);

      return {
        success: true,
        data: {
          payment_id: paymentRecord.id,
          booking_id: paymentRecord.booking_id,
          organization_id: paymentRecord.organization_id,
          fee_updated: updateData.stripe_fee_pence !== undefined
        }
      };

    } catch (error) {
      console.error('❌ WebhookService: Error in handleChargeSucceeded:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Find payment record by Stripe payment intent ID
   */
  private static async findPaymentRecord(paymentIntentId: string) {
    const { data, error } = await supabase
      .from('booking_payments')
      .select('id, booking_id, organization_id, amount_pence, currency')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      console.error('❌ WebhookService: Payment record not found:', paymentIntentId, error);
      return null;
    }

    return data;
  }

}

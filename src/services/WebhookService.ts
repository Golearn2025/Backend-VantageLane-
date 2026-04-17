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

        case 'charge.updated':
          return await this.handleChargeUpdated(event.data.object as Stripe.Charge);

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
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRecord.id)
        .neq('status', 'succeeded'); // Only update if not already succeeded

      if (paymentError) {
        console.error('❌ WebhookService: Payment UPDATE error:', {
          code: paymentError.code,
          message: paymentError.message,
          details: paymentError.details,
          hint: paymentError.hint,
          payment_id: paymentRecord.id
        });
        return { success: false, error: `Failed to update payment record: ${paymentError.message}` };
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

      // 5. Create Stripe invoice (non-blocking — do not fail webhook on invoice error)
      try {
        const { StripeInvoiceService } = await import('./StripeInvoiceService');
        const invoiceResult = await StripeInvoiceService.createInvoiceForBooking(paymentRecord.booking_id);
        if (invoiceResult.success) {
          console.log(`✅ WebhookService: Invoice ${invoiceResult.invoiceId} created for booking ${paymentRecord.booking_id}`);
        } else {
          console.error(`⚠️ WebhookService: Invoice creation failed (non-blocking): ${invoiceResult.error}`);
        }
      } catch (invoiceError: any) {
        console.error('⚠️ WebhookService: Unexpected error creating invoice (non-blocking):', invoiceError);
      }

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

      // Update fee information - fetch charge with balance_transaction from Stripe
      let updateData: any = {
        updated_at: new Date().toISOString()
      };

      let actualFee: number | null = null;

      // Stripe CLI webhooks don't include balance_transaction, so fetch the full charge
      try {
        console.log(`💳 WebhookService: Fetching full charge from Stripe: ${charge.id}`);
        const stripe = (await import('stripe')).default;
        const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-02-25.clover' });
        const fullCharge = await stripeClient.charges.retrieve(charge.id, {
          expand: ['balance_transaction']
        });

        if (fullCharge.balance_transaction && typeof fullCharge.balance_transaction !== 'string') {
          actualFee = fullCharge.balance_transaction.fee;
          console.log(`💳 WebhookService: Fetched charge with balance_transaction, fee: ${actualFee}p`);
        } else {
          console.log(`💳 WebhookService: Balance transaction not available in fetched charge`);
        }
      } catch (fetchError) {
        console.error(`⚠️ WebhookService: Failed to fetch charge from Stripe:`, fetchError);
        // Continue without fee - don't fail the webhook
      }

      if (actualFee !== null) {
        updateData.stripe_fee_pence = actualFee;
        updateData.net_amount_pence = charge.amount - actualFee;
        console.log(`💳 WebhookService: Updated actual fee ${actualFee}p for payment ${paymentRecord.id}`);
      } else {
        console.log(`💳 WebhookService: No fee data available for payment ${paymentRecord.id}`);
      }

      await supabase
        .from('booking_payments')
        .update(updateData)
        .eq('id', paymentRecord.id);

      console.log(`✅ WebhookService: Updated fee information for payment ${paymentRecord.id}`);

      // PHASE 6: Update internal_booking_financials with payment linkage
      if (updateData.stripe_fee_pence !== undefined) {
        try {
          await this.updateFinancialSnapshotWithPayment(
            paymentRecord.booking_id,
            paymentRecord.id,
            updateData.stripe_fee_pence,
            updateData.net_amount_pence
          );
          console.log(`✅ WebhookService: Updated financial snapshot for booking ${paymentRecord.booking_id}`);
        } catch (financialError) {
          console.error('⚠️ WebhookService: Failed to update financial snapshot:', financialError);
          // Don't fail the webhook if financial update fails
        }
      }

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

  /**
   * Handle charge.updated (for late-arriving balance_transaction)
   * This webhook fires when balance_transaction becomes available after charge.succeeded
   */
  private static async handleChargeUpdated(charge: Stripe.Charge): Promise<WebhookResult> {
    try {
      console.log(`🔄 WebhookService: Processing charge.updated: ${charge.id}`);

      // Find payment record by payment intent ID
      const { data: paymentRecord, error } = await supabase
        .from('booking_payments')
        .select('id, booking_id, organization_id, stripe_payment_intent_id, stripe_fee_pence, amount_pence')
        .eq('stripe_payment_intent_id', charge.payment_intent)
        .single();

      if (error || !paymentRecord) {
        console.log(`ℹ️ WebhookService: Payment intent ${charge.payment_intent} not found, ignoring`);
        return { success: true, data: { ignored: true, reason: 'Payment not found' } };
      }

      // IDEMPOTENT: Only update if stripe_fee_pence is null or 0
      if (paymentRecord.stripe_fee_pence && paymentRecord.stripe_fee_pence > 0) {
        console.log(`ℹ️ WebhookService: Fees already populated for payment ${paymentRecord.id}, skipping`);
        return { success: true, data: { ignored: true, reason: 'Fees already set' } };
      }

      // ALWAYS fetch fresh charge from Stripe with expanded balance_transaction
      // Webhook payload may not include balance_transaction even when it exists
      let actualFee: number | null = null;
      try {
        console.log(`💳 WebhookService: Fetching full charge from Stripe: ${charge.id}`);
        const stripe = (await import('stripe')).default;
        const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-02-25.clover' });
        const fullCharge = await stripeClient.charges.retrieve(charge.id, {
          expand: ['balance_transaction']
        });

        if (fullCharge.balance_transaction && typeof fullCharge.balance_transaction !== 'string') {
          actualFee = fullCharge.balance_transaction.fee;
          console.log(`💳 WebhookService: Fetched charge with balance_transaction, fee: ${actualFee}p`);
        } else {
          console.log(`💳 WebhookService: Balance transaction still not available, skipping`);
          return { success: true, data: { ignored: true, reason: 'Balance transaction not ready' } };
        }
      } catch (fetchError) {
        console.error(`⚠️ WebhookService: Failed to fetch charge from Stripe:`, fetchError);
        return { success: false, error: 'Failed to fetch charge' };
      }

      if (actualFee === null) {
        console.log(`⚠️ WebhookService: No fee available in balance_transaction`);
        return { success: true, data: { ignored: true, reason: 'No fee available' } };
      }

      const netAmount = charge.amount - actualFee;

      // Update booking_payments
      const { error: paymentError } = await supabase
        .from('booking_payments')
        .update({
          stripe_fee_pence: actualFee,
          net_amount_pence: netAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentRecord.id);

      if (paymentError) {
        console.error(`❌ WebhookService: Failed to update payment:`, paymentError);
        return { success: false, error: 'Failed to update payment' };
      }

      console.log(`✅ WebhookService: Updated payment ${paymentRecord.id} with fee ${actualFee}p`);

      // Update internal_booking_financials (Phase 6)
      try {
        await this.updateFinancialSnapshotWithPayment(
          paymentRecord.booking_id,
          paymentRecord.id,
          actualFee,
          netAmount
        );
        console.log(`✅ WebhookService: Updated financial snapshot for booking ${paymentRecord.booking_id}`);
      } catch (financialError) {
        console.error('⚠️ WebhookService: Failed to update financial snapshot:', financialError);
        // Don't fail the webhook if financial update fails
      }

      return {
        success: true,
        data: {
          payment_id: paymentRecord.id,
          booking_id: paymentRecord.booking_id,
          fee_updated: true,
          fee: actualFee
        }
      };

    } catch (error) {
      console.error('❌ WebhookService: Error in handleChargeUpdated:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * PHASE 6: Update internal_booking_financials with payment linkage
   * Called after charge.succeeded to link payment data to financial snapshot
   */
  private static async updateFinancialSnapshotWithPayment(
    bookingId: string,
    bookingPaymentId: string,
    processorFeePence: number,
    netCollectedPence: number
  ): Promise<void> {
    try {
      console.log(`💰 Updating financial snapshot for booking ${bookingId} with payment data`);

      // 1. Find the LATEST financial snapshot for this booking
      // Use version DESC to get the most recent snapshot (handles multiple versions)
      const { data: snapshot, error: fetchError } = await supabase
        .from('internal_booking_financials')
        .select('id, gross_margin_pence')
        .eq('booking_id', bookingId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !snapshot) {
        console.error('❌ Financial snapshot not found for booking:', bookingId);
        throw new Error('Financial snapshot not found');
      }

      // 2. Calculate net_margin_pence
      // Formula: net_margin_pence = gross_margin_pence - processor_fee_pence
      const netMarginPence = snapshot.gross_margin_pence - processorFeePence;

      // 3. Update financial snapshot with payment linkage
      const { error: updateError } = await supabase
        .from('internal_booking_financials')
        .update({
          booking_payment_id: bookingPaymentId,
          processor_fee_pence: processorFeePence,
          net_collected_pence: netCollectedPence,
          net_margin_pence: netMarginPence,
          updated_at: new Date().toISOString()
        })
        .eq('id', snapshot.id);

      if (updateError) {
        console.error('❌ Failed to update financial snapshot:', updateError);
        throw updateError;
      }

      console.log(`✅ Financial snapshot updated: processor_fee=${processorFeePence}p, net_collected=${netCollectedPence}p, net_margin=${netMarginPence}p`);

    } catch (error) {
      console.error('❌ Error updating financial snapshot with payment:', error);
      throw error;
    }
  }

}

/**
 * Wave 1: Payment Service
 * 
 * Handles payment intent creation and booking_payments management
 * Integrates with Stripe and existing booking system
 */

import Stripe from 'stripe';
import { supabase } from '../config/supabase';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

export interface CreatePaymentIntentParams {
  bookingId: string;
  quoteId: string;
  organizationId: string;
  customerData: {
    customerId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  idempotencyKey: string;
  amount?: number; // Frontend compatibility: allow amount override
}

export interface PaymentIntentResult {
  success: boolean;
  paymentId?: string;
  bookingId?: string;
  stripePaymentIntentId?: string;
  clientSecret?: string;
  amount?: number;
  currency?: string;
  status?: string;
  idempotencyKey?: string;
  error?: string;
}

export class PaymentService {

  /**
   * Generate idempotency key for payment attempts
   */
  static generateIdempotencyKey(): string {
    return `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create payment intent and booking_payments record
   */
  static async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    try {
      console.log('💳 PaymentService: Creating payment intent');

      // Step 1: Validate booking exists and is in PENDING_PAYMENT
      const booking = await this.validateBooking(params.bookingId, params.organizationId);
      if (!booking) {
        return {
          success: false,
          error: 'Booking not found or not in PENDING_PAYMENT status',
          bookingId: params.bookingId
        };
      }

      // Step 2: Validate quote exists and matches booking
      const quote = await this.validateQuote(params.quoteId, params.organizationId, params.bookingId);
      if (!quote) {
        return {
          success: false,
          error: 'Quote not found or does not match booking',
          bookingId: params.bookingId
        };
      }

      // Step 3: Check for existing payment with same idempotency key
      const existingPayment = await this.checkExistingIdempotency(params.idempotencyKey);
      if (existingPayment) {
        console.log('🔄 PaymentService: Found existing payment for idempotency key');

        // For existing payments, we need to retrieve the client_secret from Stripe
        // or return a clear status that frontend can handle
        let clientSecret = null;
        if (existingPayment.status === 'pending') {
          try {
            const stripeIntent = await stripe.paymentIntents.retrieve(existingPayment.stripe_payment_intent_id);
            clientSecret = stripeIntent.client_secret;
          } catch (error) {
            console.warn('⚠️ PaymentService: Could not retrieve client secret for existing payment');
          }
        }

        return {
          success: true,
          paymentId: existingPayment.id,
          bookingId: existingPayment.booking_id,
          stripePaymentIntentId: existingPayment.stripe_payment_intent_id,
          clientSecret: clientSecret ?? undefined, // Return actual client_secret if available
          amount: existingPayment.amount_pence,
          currency: existingPayment.currency,
          status: existingPayment.status,
          idempotencyKey: params.idempotencyKey
        };
      }

      // Step 4: Create Stripe payment intent
      const stripeIntent = await this.createStripePaymentIntent(quote, params.customerData, params.idempotencyKey, params.amount);

      // Step 5: Create booking_payments record
      const paymentRecord = await this.createPaymentRecord(params, stripeIntent);

      console.log('✅ PaymentService: Payment intent created successfully');
      return {
        success: true,
        paymentId: paymentRecord.id,
        bookingId: paymentRecord.booking_id,
        stripePaymentIntentId: stripeIntent.id,
        clientSecret: stripeIntent.client_secret ?? undefined,
        amount: stripeIntent.amount,
        currency: stripeIntent.currency,
        status: 'pending',
        idempotencyKey: params.idempotencyKey
      };

    } catch (error) {
      console.error('❌ PaymentService: Error creating payment intent:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        bookingId: params.bookingId
      };
    }
  }

  /**
   * Validate booking exists and is in correct status
   */
  private static async validateBooking(bookingId: string, organizationId: string) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, customer_id, organization_id, currency, billing_snapshot')
      .eq('id', bookingId)
      .eq('organization_id', organizationId)
      .eq('status', 'PENDING_PAYMENT')
      .single();

    if (error || !data) {
      console.error('❌ PaymentService: Booking validation failed:', error);
      return null;
    }

    return data;
  }

  /**
   * Validate quote exists and matches booking
   */
  private static async validateQuote(quoteId: string, organizationId: string, bookingId: string) {
    const { data, error } = await supabase
      .from('client_booking_quotes')
      .select('id, total_pence, currency, booking_id, organization_id, quote_valid_until')
      .eq('id', quoteId)
      .eq('organization_id', organizationId)
      .eq('booking_id', bookingId)
      .single();

    if (error || !data) {
      console.error('❌ PaymentService: Quote validation failed:', error);
      return null;
    }

    // Check quote expiration
    if (data.quote_valid_until && new Date() > new Date(data.quote_valid_until)) {
      console.error('❌ PaymentService: Quote has expired:', data.quote_valid_until);
      return null;
    }

    return data;
  }

  /**
   * Check for existing payment with same idempotency key
   */
  private static async checkExistingIdempotency(idempotencyKey: string) {
    const { data, error } = await supabase
      .from('booking_payments')
      .select('id, booking_id, stripe_payment_intent_id, amount_pence, currency, status')
      .eq('idempotency_key', idempotencyKey)
      .is('deleted_at', null) // Wave 1 fix: Use .is() for null checks
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('❌ PaymentService: Idempotency check failed:', error);
      return null;
    }

    return data;
  }

  /**
   * Create Stripe payment intent
   */
  private static async createStripePaymentIntent(quote: any, customerData: CreatePaymentIntentParams['customerData'], idempotencyKey: string, amount?: number) {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amount || quote.total_pence, // Use backend amount, not frontend override
        currency: quote.currency.toLowerCase(),
        receipt_email: customerData.email,
        // Remove customer field unless it's a real Stripe customer ID
        metadata: {
          quote_id: quote.id,
          booking_id: quote.booking_id, // Add booking_id to metadata
          organization_id: quote.organization_id,
          internal_customer_id: customerData.customerId, // Keep internal ID in metadata
          source: 'vantage_lane_booking'
        },
        automatic_payment_methods: {
          enabled: true
        }
      },
      {
        idempotencyKey: idempotencyKey // Correct: idempotency key as request option, not payload
      }
    );

    return paymentIntent;
  }

  /**
   * Create booking_payments record
   */
  private static async createPaymentRecord(
    params: CreatePaymentIntentParams,
    stripeIntent: Stripe.PaymentIntent
  ) {
    const paymentData = {
      booking_id: params.bookingId,
      quote_id: params.quoteId,
      stripe_payment_intent_id: stripeIntent.id,
      stripe_customer_id: params.customerData.customerId,
      amount_pence: stripeIntent.amount,
      currency: stripeIntent.currency.toUpperCase(),
      status: 'pending',
      receipt_email: params.customerData.email,
      idempotency_key: params.idempotencyKey,
      attempt_no: 1,
      livemode: stripeIntent.livemode,
      organization_id: params.organizationId,
      metadata: {
        stripe_fee_pence: 0, // Will be updated after payment
        net_amount_pence: stripeIntent.amount, // Will be updated after payment
        customer_data: params.customerData
      }
    };

    const { data, error } = await supabase
      .from('booking_payments')
      .insert(paymentData)
      .select('id, booking_id, stripe_payment_intent_id, amount_pence, currency, status, idempotency_key')
      .single();

    if (error || !data) {
      console.error('❌ PaymentService: Failed to create payment record:', error);
      throw new Error('Failed to create payment record');
    }

    return data;
  }

  /**
   * Get payment status
   */
  static async getPaymentStatus(paymentId: string, organizationId: string): Promise<PaymentIntentResult> {
    try {
      const { data, error } = await supabase
        .from('booking_payments')
        .select('id, booking_id, stripe_payment_intent_id, amount_pence, currency, status, created_at, updated_at')
        .eq('id', paymentId)
        .eq('organization_id', organizationId)
        .eq('deleted_at', null)
        .single();

      if (error || !data) {
        return {
          success: false,
          error: 'Payment not found',
          paymentId
        };
      }

      return {
        success: true,
        paymentId: data.id,
        bookingId: data.booking_id,
        stripePaymentIntentId: data.stripe_payment_intent_id,
        amount: data.amount_pence,
        currency: data.currency,
        status: data.status
      };

    } catch (error) {
      console.error('❌ PaymentService: Error getting payment status:', error);
      return {
        success: false,
        error: 'Failed to get payment status',
        paymentId
      };
    }
  }
}

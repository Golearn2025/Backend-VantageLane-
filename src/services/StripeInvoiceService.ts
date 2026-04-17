/**
 * Stripe Invoice Service
 *
 * Creates a post-payment invoice for confirmed bookings.
 * Called from WebhookService after payment_intent.succeeded.
 *
 * Design notes:
 * - Payment is already collected via PaymentIntent — invoice is created retroactively
 * - Invoice is finalised and marked paid_out_of_band so Stripe sends the PDF by email
 * - Idempotent: checks metadata.stripe_invoice_id before creating a new invoice
 * - Non-VAT registered: single line item with total amount, no VAT breakdown on invoice
 */

import Stripe from 'stripe';
import { supabase } from '../config/supabase';

export interface InvoiceResult {
  success: boolean;
  invoiceId?: string;
  alreadyExists?: boolean;
  error?: string;
}

export class StripeInvoiceService {

  /**
   * Create and finalise a Stripe invoice for a confirmed booking.
   * Safe to call multiple times — idempotent via metadata check.
   */
  static async createInvoiceForBooking(bookingId: string): Promise<InvoiceResult> {
    try {
      console.log(`🧾 StripeInvoiceService: Creating invoice for booking ${bookingId}`);

      // ── 1. Load payment record ────────────────────────────────────────────
      const { data: payment, error: paymentError } = await supabase
        .from('booking_payments')
        .select('id, stripe_customer_id, receipt_email, amount_pence, currency, metadata')
        .eq('booking_id', bookingId)
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (paymentError || !payment) {
        throw new Error(`Payment record not found for booking ${bookingId}`);
      }

      // Idempotency guard
      if (payment.metadata?.stripe_invoice_id) {
        console.log(`ℹ️ StripeInvoiceService: Invoice already exists: ${payment.metadata.stripe_invoice_id}`);
        return { success: true, invoiceId: payment.metadata.stripe_invoice_id, alreadyExists: true };
      }

      // ── 2. Load booking reference ─────────────────────────────────────────
      const { data: booking } = await supabase
        .from('bookings')
        .select('reference')
        .eq('id', bookingId)
        .single();

      const reference = booking?.reference ?? bookingId.slice(0, 8).toUpperCase();
      const currency = (payment.currency ?? 'GBP').toLowerCase();
      const totalPence = payment.amount_pence;

      // ── 3. Resolve Stripe customer ────────────────────────────────────────
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2026-02-25.clover'
      });

      // stripe_customer_id in booking_payments may store an internal UUID instead of a real
      // Stripe customer ID (cus_...). Only use it if it looks like a Stripe ID.
      let stripeCustomerId: string | null =
        payment.stripe_customer_id?.startsWith('cus_') ? payment.stripe_customer_id : null;

      if (!stripeCustomerId && payment.receipt_email) {
        const existing = await stripe.customers.list({
          email: payment.receipt_email,
          limit: 1
        });

        if (existing.data.length > 0) {
          stripeCustomerId = existing.data[0].id;
          console.log(`✅ StripeInvoiceService: Found existing Stripe customer ${stripeCustomerId}`);
        } else {
          const created = await stripe.customers.create({
            email: payment.receipt_email
          });
          stripeCustomerId = created.id;
          console.log(`✅ StripeInvoiceService: Created Stripe customer ${stripeCustomerId}`);
        }

        // Persist the resolved customer ID back to the payment record
        await supabase
          .from('booking_payments')
          .update({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() })
          .eq('id', payment.id);
      }

      if (!stripeCustomerId) {
        throw new Error('Cannot create invoice: no Stripe customer ID or receipt email available');
      }

      // ── 4. Create invoice ─────────────────────────────────────────────────
      const invoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        auto_advance: false,          // We finalise manually below
        collection_method: 'send_invoice',
        days_until_due: 0,
        description: `Vantage Lane — Booking ${reference}`,
        metadata: {
          booking_id: bookingId,
          booking_reference: reference
        }
      });

      // ── 5. Add line item ──────────────────────────────────────────────────
      // Single item representing the total charged.
      // When VAT-registered in the future, replace with component-level items + VAT line.
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: invoice.id,
        description: `Chauffeur Service — Booking ${reference}`,
        amount: totalPence,
        currency
      });

      // ── 6. Finalise invoice ───────────────────────────────────────────────
      await stripe.invoices.finalizeInvoice(invoice.id);

      // ── 7. Mark as paid (payment already collected via PaymentIntent) ─────
      await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });

      // ── 8. Persist invoice ID in payment metadata ─────────────────────────
      await supabase
        .from('booking_payments')
        .update({
          metadata: { ...(payment.metadata ?? {}), stripe_invoice_id: invoice.id },
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      console.log(`✅ StripeInvoiceService: Invoice ${invoice.id} created and paid for booking ${bookingId}`);

      return { success: true, invoiceId: invoice.id };

    } catch (error: any) {
      console.error('❌ StripeInvoiceService: Failed to create invoice:', error);
      return { success: false, error: error.message };
    }
  }
}

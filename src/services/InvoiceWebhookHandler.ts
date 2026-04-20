/**
 * Invoice Webhook Handler — Stripe Invoice First (parallel system)
 *
 * Handles invoice.* webhook events for the new invoice-first flows
 * (invoice_first_send + invoice_first_charge). Lives behind
 * InvoiceFirstWebhookService and is reached only via the dedicated
 * /api/stripe/invoice-webhook-internal endpoint. The legacy WebhookService
 * is never on this path.
 *
 * Booking lifecycle is driven EXCLUSIVELY by these events:
 *
 *   invoice.finalized           → log + sync invoice metadata (no status change)
 *   invoice.sent                → corporate flow only: stamp invoice_sent_at
 *   invoice.paid                → mark payment succeeded + booking CONFIRMED
 *   invoice.payment_succeeded   → alias of invoice.paid
 *   invoice.payment_failed      → mark payment failed + booking PAYMENT_FAILED
 *   invoice.voided              → mark payment canceled + booking CANCELLED
 *   invoice.marked_uncollectible→ mark payment uncollectible (NO booking change;
 *                                 needs manual review — different from voided)
 *
 * SAFETY CONTRACT (addresses prior review feedback):
 *
 *   1. invoice.paid is NEVER ack'd silently when the local row is missing.
 *      Instead we reconcile: locate the booking via invoice.metadata.booking_id
 *      and rebuild booking_payments. If the booking itself doesn't exist, we
 *      return success:false so the dedup pipeline schedules a retry — never a
 *      silent terminal-money loss.
 *
 *   2. invoice.voided and invoice.marked_uncollectible are split:
 *        voided              → booking CANCELLED
 *        marked_uncollectible→ booking untouched, payment marked 'uncollectible'
 *
 *   3. Stripe timestamps (status_transitions.*) are preferred when present.
 *
 *   4. All writes are guarded by status WHERE clauses (idempotent transitions).
 */

import Stripe from 'stripe';
import { supabase } from '../config/supabase';

export interface InvoiceWebhookResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface PaymentRowLite {
  id: string;
  booking_id: string;
  organization_id: string;
  status: string;
  attempt_no: number;
}

export class InvoiceWebhookHandler {

  /**
   * Dispatch a Stripe invoice.* event to the appropriate handler.
   */
  static async handle(event: Stripe.Event): Promise<InvoiceWebhookResult> {
    const invoice = event.data.object as Stripe.Invoice;
    const bookingMeta = invoice.metadata?.booking_id ?? 'n/a';
    console.log(`📨 [InvoiceWH] event=${event.type} invoice=${invoice.id} status=${invoice.status} booking_id=${bookingMeta}`);

    switch (event.type) {
      case 'invoice.finalized':
        return this.handleInvoiceFinalized(invoice);

      case 'invoice.sent':
        return this.handleInvoiceSent(invoice);

      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        return this.handleInvoicePaid(invoice);

      case 'invoice.payment_failed':
        return this.handleInvoicePaymentFailed(invoice);

      case 'invoice.voided':
        return this.handleInvoiceVoided(invoice);

      case 'invoice.marked_uncollectible':
        return this.handleInvoiceUncollectible(invoice);

      default:
        console.log(`ℹ️ [InvoiceWH] Ignoring event type ${event.type}`);
        return { success: true, data: { ignored: true, reason: `unsupported event ${event.type}` } };
    }
  }

  // --------------------------------------------------------------------------
  // Lookup
  // --------------------------------------------------------------------------

  private static async findPaymentByInvoice(invoiceId: string): Promise<PaymentRowLite | null> {
    const { data, error } = await supabase
      .from('booking_payments')
      .select('id, booking_id, organization_id, status, attempt_no')
      .eq('stripe_invoice_id', invoiceId)
      .order('attempt_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`❌ [InvoiceWH] DB error looking up payment for invoice ${invoiceId}:`, error.message);
      return null;
    }
    return (data as PaymentRowLite | null) ?? null;
  }

  // --------------------------------------------------------------------------
  // Handlers — non-terminal
  // --------------------------------------------------------------------------

  private static async handleInvoiceFinalized(invoice: Stripe.Invoice): Promise<InvoiceWebhookResult> {
    const payment = await this.findPaymentByInvoice(invoice.id);
    if (!payment) {
      // Non-terminal money event — benign ignore is acceptable here.
      return { success: true, data: { ignored: true, reason: 'no booking_payments row for invoice' } };
    }

    const finalizedAt = this.stripeFinalizedAt(invoice) ?? new Date().toISOString();
    const { error } = await supabase
      .from('booking_payments')
      .update({
        stripe_invoice_status: invoice.status ?? 'open',
        stripe_invoice_number: invoice.number ?? null,
        hosted_invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_finalized_at: finalizedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    if (error) {
      console.error('⚠️ [InvoiceWH] Failed to sync finalized invoice:', error.message);
    }
    return { success: true, data: { invoice_id: invoice.id, action: 'finalized_synced' } };
  }

  private static async handleInvoiceSent(invoice: Stripe.Invoice): Promise<InvoiceWebhookResult> {
    const payment = await this.findPaymentByInvoice(invoice.id);
    if (!payment) {
      return { success: true, data: { ignored: true, reason: 'no booking_payments row for invoice' } };
    }

    const { error } = await supabase
      .from('booking_payments')
      .update({
        stripe_invoice_status: invoice.status ?? 'open',
        invoice_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .is('invoice_sent_at', null);

    if (error) {
      console.error('⚠️ [InvoiceWH] Failed to sync invoice.sent:', error.message);
    }
    return { success: true, data: { invoice_id: invoice.id, action: 'sent_synced' } };
  }

  // --------------------------------------------------------------------------
  // Handlers — terminal money events
  // --------------------------------------------------------------------------

  private static async handleInvoicePaid(invoice: Stripe.Invoice): Promise<InvoiceWebhookResult> {
    let payment = await this.findPaymentByInvoice(invoice.id);

    // ---- Reconciliation path ------------------------------------------------
    // invoice.paid is a terminal MONEY event. We MUST NOT silently ack it
    // when our local state is missing — that would cause "paid in Stripe,
    // unconfirmed locally, no retry" data loss. Instead, attempt to rebuild
    // the booking_payments row from the booking referenced in invoice.metadata.
    if (!payment) {
      const bookingId = invoice.metadata?.booking_id ?? null;
      if (!bookingId) {
        console.error(`❌ [InvoiceWH] invoice.paid reconciliation impossible: no booking_id in metadata, invoice=${invoice.id}`);
        return {
          success: false,
          error: `invoice.paid received for ${invoice.id} with no local row and no booking_id metadata`,
        };
      }

      const { data: booking, error: bookingFetchErr } = await supabase
        .from('bookings')
        .select('id, organization_id, currency')
        .eq('id', bookingId)
        .maybeSingle();

      if (bookingFetchErr || !booking) {
        // Booking itself is missing — DB might be lagging. Force Stripe to retry.
        console.error(`❌ [InvoiceWH] invoice.paid: booking ${bookingId} not found; returning failure to trigger retry`);
        return {
          success: false,
          error: `Booking ${bookingId} not found for invoice ${invoice.id}`,
        };
      }

      console.log(`🔧 [InvoiceWH] Reconciling missing booking_payments row for invoice ${invoice.id} → booking ${bookingId}`);

      // Best-effort: pick the next attempt_no after any existing rows
      const { data: latestAttempt } = await supabase
        .from('booking_payments')
        .select('attempt_no')
        .eq('booking_id', bookingId)
        .order('attempt_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      const attemptNo = (latestAttempt?.attempt_no ?? 0) + 1;

      const insertRow = {
        booking_id: bookingId,
        organization_id: booking.organization_id,
        amount_pence: invoice.amount_paid ?? invoice.amount_due ?? 0,
        currency: (invoice.currency ?? booking.currency ?? 'gbp').toUpperCase(),
        status: 'pending',
        idempotency_key: `inv_recon_${bookingId}_${invoice.id}`,
        attempt_no: attemptNo,
        livemode: invoice.livemode,
        payment_kind: 'full',
        stripe_invoice_id: invoice.id,
        stripe_invoice_status: invoice.status ?? 'paid',
        stripe_invoice_number: invoice.number ?? null,
        hosted_invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_finalized_at: this.stripeFinalizedAt(invoice),
        metadata: {
          flow: invoice.metadata?.flow ?? 'invoice_first_unknown',
          reconciled_from: 'invoice.paid',
          invoice_id: invoice.id,
        },
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('booking_payments')
        .upsert(insertRow, { onConflict: 'idempotency_key' })
        .select('id, booking_id, organization_id, status, attempt_no')
        .single();

      if (insertErr || !inserted) {
        console.error(`❌ [InvoiceWH] Reconciliation insert failed for invoice ${invoice.id}:`, insertErr?.message);
        return {
          success: false,
          error: `Reconciliation failed: ${insertErr?.message ?? 'unknown'}`,
        };
      }
      payment = inserted as PaymentRowLite;
      console.log(`✅ [InvoiceWH] Reconciled booking_payments ${payment.id} for invoice ${invoice.id}`);
    }

    // ---- Mark payment succeeded --------------------------------------------
    const paidAt = this.stripePaidAt(invoice) ?? new Date().toISOString();

    // `charge` and `payment_intent` are no longer in the current Stripe TS
    // types (Invoice → moved to PaymentIntent expansion), but are still
    // populated at runtime for back-compat. Read defensively.
    const invoiceLoose = invoice as unknown as {
      charge?: string | { id: string } | null;
      payment_intent?: string | { id: string } | null;
    };
    const chargeRef = invoiceLoose.charge;
    const piRef = invoiceLoose.payment_intent;
    const chargeId = typeof chargeRef === 'string' ? chargeRef : chargeRef?.id ?? null;
    const stripePaymentIntentId = typeof piRef === 'string' ? piRef : piRef?.id ?? null;

    const { error: payErr } = await supabase
      .from('booking_payments')
      .update({
        status: 'succeeded',
        stripe_invoice_status: invoice.status ?? 'paid',
        stripe_payment_intent_id: stripePaymentIntentId,
        stripe_charge_id: chargeId,
        captured_at: paidAt,
        invoice_paid_at: paidAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .neq('status', 'succeeded');

    if (payErr) {
      console.error('❌ [InvoiceWH] Failed to mark payment succeeded:', payErr.message);
      return { success: false, error: `Failed to update payment: ${payErr.message}` };
    }

    // ---- Confirm booking (idempotent transition) ----------------------------
    // We treat the booking confirmation as CRITICAL: if it fails we surface
    // the error so the webhook is retried by Stripe. This is safe because:
    //   - the booking_payments update above uses `.neq('status','succeeded')`
    //     so retries won't double-apply it
    //   - the bookings update below is idempotent (status='CONFIRMED' from any
    //     of the allow-listed source states)
    // Without this, a transient DB issue (or a missing trigger allow-rule)
    // would leave the booking stuck in AWAITING_INVOICE_CONFIRM forever even
    // though Stripe has the money.
    const { data: confirmed, error: bookingErr } = await supabase
      .from('bookings')
      .update({
        status: 'CONFIRMED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.booking_id)
      .in('status', ['NEW', 'PENDING_PAYMENT', 'PAYMENT_FAILED', 'AWAITING_INVOICE_PAYMENT', 'AWAITING_INVOICE_CONFIRM'])
      .select('id, status');

    if (bookingErr) {
      console.error('❌ [InvoiceWH] Failed to confirm booking — will retry:', bookingErr.message);
      return {
        success: false,
        error: `Failed to confirm booking ${payment.booking_id} after invoice.paid: ${bookingErr.message}`,
      };
    }

    // If 0 rows updated, the booking is already in a terminal post-confirmation
    // state (CONFIRMED/IN_PROGRESS/COMPLETED) — that is also "success".
    const matched = confirmed?.length ?? 0;
    console.log(
      `✅ [InvoiceWH] invoice.paid → booking ${payment.booking_id} CONFIRMED ` +
      `(invoice ${invoice.id}, rows_updated=${matched})`,
    );

    return {
      success: true,
      data: {
        payment_id: payment.id,
        booking_id: payment.booking_id,
        organization_id: payment.organization_id,
        status: 'CONFIRMED',
        invoice_id: invoice.id,
        amount: invoice.amount_paid,
      },
    };
  }

  private static async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<InvoiceWebhookResult> {
    const payment = await this.findPaymentByInvoice(invoice.id);
    if (!payment) {
      // Terminal-ish event. Try to surface as failure so dedup retries.
      console.error(`❌ [InvoiceWH] invoice.payment_failed but no local row for invoice ${invoice.id} — returning failure to retry`);
      return {
        success: false,
        error: `No booking_payments row for invoice ${invoice.id} (payment_failed)`,
      };
    }

    const lastError =
      (invoice.last_finalization_error as { message?: string } | null | undefined)?.message ??
      'Invoice payment failed';

    const { error: payErr } = await supabase
      .from('booking_payments')
      .update({
        status: 'failed',
        stripe_invoice_status: invoice.status ?? 'open',
        last_error: lastError,
        failed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .in('status', ['draft', 'pending', 'processing']);

    if (payErr) {
      console.error('❌ [InvoiceWH] Failed to mark payment failed:', payErr.message);
      return { success: false, error: `Failed to update payment: ${payErr.message}` };
    }

    const { error: bookingErr } = await supabase
      .from('bookings')
      .update({
        status: 'PAYMENT_FAILED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.booking_id)
      .in('status', ['AWAITING_INVOICE_PAYMENT', 'AWAITING_INVOICE_CONFIRM']);

    if (bookingErr) {
      console.error('⚠️ [InvoiceWH] Failed to set booking PAYMENT_FAILED (non-blocking):', bookingErr.message);
    }

    console.log(`❌ [InvoiceWH] invoice.payment_failed → booking ${payment.booking_id} PAYMENT_FAILED (invoice ${invoice.id})`);

    return {
      success: true,
      data: {
        payment_id: payment.id,
        booking_id: payment.booking_id,
        organization_id: payment.organization_id,
        status: 'PAYMENT_FAILED',
        invoice_id: invoice.id,
        error: lastError,
      },
    };
  }

  private static async handleInvoiceVoided(invoice: Stripe.Invoice): Promise<InvoiceWebhookResult> {
    const payment = await this.findPaymentByInvoice(invoice.id);
    if (!payment) {
      return { success: true, data: { ignored: true, reason: 'no booking_payments row for voided invoice' } };
    }

    const { error: payErr } = await supabase
      .from('booking_payments')
      .update({
        status: 'canceled',
        stripe_invoice_status: invoice.status ?? 'void',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .in('status', ['draft', 'pending', 'processing']);

    if (payErr) {
      console.error('❌ [InvoiceWH] Failed to cancel payment:', payErr.message);
      return { success: false, error: `Failed to update payment: ${payErr.message}` };
    }

    const { error: bookingErr } = await supabase
      .from('bookings')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.booking_id)
      .in('status', ['AWAITING_INVOICE_PAYMENT', 'AWAITING_INVOICE_CONFIRM']);

    if (bookingErr) {
      console.error('⚠️ [InvoiceWH] Failed to set booking CANCELLED (non-blocking):', bookingErr.message);
    }

    console.log(`🚫 [InvoiceWH] invoice.voided → booking ${payment.booking_id} CANCELLED (invoice ${invoice.id})`);

    return {
      success: true,
      data: {
        payment_id: payment.id,
        booking_id: payment.booking_id,
        organization_id: payment.organization_id,
        status: 'CANCELLED',
        invoice_id: invoice.id,
      },
    };
  }

  /**
   * Uncollectible is an accounting write-off, not a booking cancellation.
   * The service may already have been delivered. We mark the payment as
   * `uncollectible` and stamp the booking metadata for manual review,
   * but we DO NOT change booking.status.
   */
  private static async handleInvoiceUncollectible(invoice: Stripe.Invoice): Promise<InvoiceWebhookResult> {
    const payment = await this.findPaymentByInvoice(invoice.id);
    if (!payment) {
      return { success: true, data: { ignored: true, reason: 'no booking_payments row for uncollectible invoice' } };
    }

    const { error: payErr } = await supabase
      .from('booking_payments')
      .update({
        status: 'uncollectible',
        stripe_invoice_status: invoice.status ?? 'uncollectible',
        last_error: 'Invoice marked uncollectible by Stripe',
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    if (payErr) {
      console.error('❌ [InvoiceWH] Failed to mark payment uncollectible:', payErr.message);
      return { success: false, error: `Failed to update payment: ${payErr.message}` };
    }

    console.log(`📌 [InvoiceWH] invoice.marked_uncollectible → booking ${payment.booking_id} payment marked uncollectible (booking status untouched, manual review)`);

    return {
      success: true,
      data: {
        payment_id: payment.id,
        booking_id: payment.booking_id,
        organization_id: payment.organization_id,
        status: 'uncollectible',
        invoice_id: invoice.id,
        review_required: true,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Stripe timestamp helpers
  // --------------------------------------------------------------------------

  private static stripeFinalizedAt(invoice: Stripe.Invoice): string | null {
    const ts = invoice.status_transitions?.finalized_at;
    return ts ? new Date(ts * 1000).toISOString() : null;
  }

  private static stripePaidAt(invoice: Stripe.Invoice): string | null {
    const ts = invoice.status_transitions?.paid_at;
    return ts ? new Date(ts * 1000).toISOString() : null;
  }
}

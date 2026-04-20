/**
 * Invoice First Webhook Service — parallel webhook orchestrator for invoice.*
 *
 * This service is intentionally separate from the legacy `WebhookService`.
 * It owns its own dedup table (`stripe_invoice_events`) and its own
 * claim/retry semantics. The legacy service is never reached for invoice-first
 * events.
 *
 * Why a separate service:
 *   The legacy WebhookService.processEventWithDeduplication has a known
 *   retry bug: events that fail once are seen as "in-flight" forever on
 *   subsequent attempts. Per the user's directive ("zero modifications to
 *   legacy"), we do not patch that. Instead we ship the new flow with a
 *   correct claim/retry implementation from day one.
 *
 * Claim semantics (different from legacy stripe_events):
 *   ─ first time:                  insert row, claim, process
 *   ─ row exists, processed_at:    ignore (already done — terminal success)
 *   ─ row exists, in-flight fresh: ignore (another worker is processing)
 *   ─ row exists, in-flight stale: re-claim (worker likely crashed)
 *   ─ row exists, failed_at set:   re-claim (RETRY — this is the key fix)
 *   ─ claim_count > MAX_RETRIES:   surface error so it shows up in alerts
 *
 * Failure handling:
 *   On handler failure we set failed_at + processing_error and compute
 *   next_retry_at. Stripe will retry the webhook anyway; the service-level
 *   retry log gives us observability and a circuit breaker.
 */

import Stripe from 'stripe';
import { supabase } from '../config/supabase';
import { InvoiceWebhookHandler, InvoiceWebhookResult } from './InvoiceWebhookHandler';

const STALE_CLAIM_MS = 5 * 60 * 1000;      // 5 minutes
const MAX_CLAIM_COUNT = 8;                 // hard ceiling per event
const RETRY_BACKOFF_MS = (n: number) => Math.min(60_000 * Math.pow(2, n), 60 * 60 * 1000);

interface ExistingEventRow {
  id: string;
  stripe_event_id: string;
  processed_at: string | null;
  failed_at: string | null;
  claimed_at: string | null;
  claim_count: number;
}

export class InvoiceFirstWebhookService {

  /**
   * Process a Stripe event end-to-end with dedup, claim, dispatch and result
   * persistence. Idempotent across calls and safe under concurrent invocation.
   *
   * Return shape mirrors InvoiceWebhookResult so the HTTP layer can map it
   * to a 2xx (success) or 5xx (retry me) response.
   */
  static async processEventWithDeduplication(event: Stripe.Event): Promise<InvoiceWebhookResult> {
    const tag = '[InvoiceFirstWH]';
    const eventId = event.id;
    const eventType = event.type;
    const invoice = event.data.object as Stripe.Invoice;
    const invoiceId = invoice?.id ?? null;

    console.log(`${tag} → event=${eventType} id=${eventId} invoice=${invoiceId}`);

    // 1) Try to insert the dedup row. If it conflicts, fetch the existing one.
    const insertRow = {
      stripe_event_id: eventId,
      event_type: eventType,
      livemode: event.livemode,
      api_version: event.api_version,
      payload: event as unknown as Record<string, unknown>,
      stripe_invoice_id: invoiceId,
      booking_id: invoice?.metadata?.booking_id ?? null,
      claim_count: 1,
      claimed_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('stripe_invoice_events')
      .insert(insertRow)
      .select('id, stripe_event_id, processed_at, failed_at, claimed_at, claim_count')
      .single();

    let row: ExistingEventRow;
    if (!insertErr && inserted) {
      row = inserted as ExistingEventRow;
      console.log(`${tag} claimed NEW dedup row ${row.id} for event ${eventId}`);
    } else {
      // Conflict — re-claim if allowed.
      const reclaim = await this.tryReclaim(eventId, tag);
      if (!reclaim.allowed) {
        return {
          success: true,
          data: { skipped: true, reason: reclaim.reason, event_id: eventId },
        };
      }
      row = reclaim.row;
    }

    // 2) Dispatch to handler.
    let result: InvoiceWebhookResult;
    try {
      result = await InvoiceWebhookHandler.handle(event);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${tag} handler threw for ${eventId}:`, message);
      result = { success: false, error: message };
    }

    // 3) Persist outcome.
    if (result.success) {
      await this.markProcessed(row.id, result, tag);
    } else {
      await this.markFailed(row.id, row.claim_count, result.error ?? 'unknown', tag);
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Claim helpers
  // --------------------------------------------------------------------------

  /**
   * Decide whether an existing dedup row may be re-claimed by this caller.
   * Returns the (now-claimed) row when allowed, or a skip reason otherwise.
   */
  private static async tryReclaim(eventId: string, tag: string): Promise<
    | { allowed: false; reason: string; row?: ExistingEventRow }
    | { allowed: true; row: ExistingEventRow }
  > {
    const { data: existing, error } = await supabase
      .from('stripe_invoice_events')
      .select('id, stripe_event_id, processed_at, failed_at, claimed_at, claim_count')
      .eq('stripe_event_id', eventId)
      .maybeSingle();

    if (error) {
      console.error(`${tag} fetch existing row failed:`, error.message);
      return { allowed: false, reason: `db_error:${error.message}` };
    }
    if (!existing) {
      // Insert raced and lost; very rare. Treat as skip.
      return { allowed: false, reason: 'no_existing_row_after_conflict' };
    }

    const row = existing as ExistingEventRow;

    if (row.processed_at) {
      console.log(`${tag} event ${eventId} already processed at ${row.processed_at} — ignoring`);
      return { allowed: false, reason: 'already_processed', row };
    }

    if (row.claim_count >= MAX_CLAIM_COUNT) {
      console.error(`${tag} event ${eventId} reached MAX_CLAIM_COUNT=${MAX_CLAIM_COUNT} — circuit-breaking`);
      return { allowed: false, reason: 'max_retries_reached', row };
    }

    const isFailed = row.failed_at !== null;
    const isStale = row.claimed_at
      ? Date.now() - new Date(row.claimed_at).getTime() > STALE_CLAIM_MS
      : true;
    const isFresh = row.claimed_at && !isStale;

    // Reclaim only if the previous attempt failed OR is stale.
    if (!isFailed && isFresh) {
      console.log(`${tag} event ${eventId} is in-flight (claimed_at=${row.claimed_at}) — skipping`);
      return { allowed: false, reason: 'in_flight', row };
    }

    const newClaimCount = row.claim_count + 1;
    const { data: updated, error: updErr } = await supabase
      .from('stripe_invoice_events')
      .update({
        claimed_at: new Date().toISOString(),
        claim_count: newClaimCount,
        failed_at: null,            // clear so next failure is a fresh signal
        processing_error: null,
      })
      .eq('id', row.id)
      .eq('claim_count', row.claim_count) // optimistic concurrency
      .select('id, stripe_event_id, processed_at, failed_at, claimed_at, claim_count')
      .single();

    if (updErr || !updated) {
      console.warn(`${tag} re-claim of event ${eventId} lost the race; skipping`);
      return { allowed: false, reason: 'reclaim_race_lost' };
    }

    console.log(`${tag} re-claimed event ${eventId} attempt #${newClaimCount} (was failed=${isFailed} stale=${isStale})`);
    return { allowed: true, row: updated as ExistingEventRow };
  }

  private static async markProcessed(
    rowId: string,
    result: InvoiceWebhookResult,
    tag: string,
  ): Promise<void> {
    const data = result.data ?? {};
    const { error } = await supabase
      .from('stripe_invoice_events')
      .update({
        processed_at: new Date().toISOString(),
        failed_at: null,
        processing_error: null,
        claimed_at: null,
        next_retry_at: null,
        booking_id: (data.booking_id as string | undefined) ?? undefined,
        booking_payment_id: (data.payment_id as string | undefined) ?? undefined,
        metadata: data,
      })
      .eq('id', rowId);

    if (error) {
      console.error(`${tag} markProcessed failed for row ${rowId}:`, error.message);
    }
  }

  private static async markFailed(
    rowId: string,
    claimCount: number,
    errorMsg: string,
    tag: string,
  ): Promise<void> {
    const nextRetryAt = new Date(Date.now() + RETRY_BACKOFF_MS(claimCount)).toISOString();
    const { error } = await supabase
      .from('stripe_invoice_events')
      .update({
        failed_at: new Date().toISOString(),
        processing_error: errorMsg.slice(0, 2000),
        claimed_at: null,
        next_retry_at: nextRetryAt,
      })
      .eq('id', rowId);

    if (error) {
      console.error(`${tag} markFailed failed for row ${rowId}:`, error.message);
    } else {
      console.log(`${tag} marked row ${rowId} failed (next_retry_at=${nextRetryAt})`);
    }
  }
}

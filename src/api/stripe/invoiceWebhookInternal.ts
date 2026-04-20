/**
 * Stripe Invoice First — internal webhook receiver
 *
 * Receives a Stripe.Event payload that has ALREADY been signature-verified
 * by the Next.js public webhook (`/api/stripe/invoice-webhook`) and forwarded
 * server-to-server. Authenticated via shared internal secret.
 *
 * The Next.js layer is the only entity that holds STRIPE_WEBHOOK_SECRET_INVOICE.
 * The Backend trusts forwarded events because it trusts the secret.
 *
 * INTERDICTIONS:
 *   - MUST NOT be exposed to public traffic.
 *   - MUST NOT process events without secret check.
 *   - MUST NOT touch the legacy WebhookService or the `stripe_events` table.
 */

import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { InvoiceFirstWebhookService } from '../../services/InvoiceFirstWebhookService';

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

export function requireInvoiceWebhookSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!INTERNAL_SECRET) {
    console.error('❌ [InvoiceWebhookInternal] INTERNAL_API_SECRET not set — blocking');
    res.status(503).json({ error: 'Server not configured' });
    return;
  }
  const provided = req.headers['x-internal-secret'];
  if (provided !== INTERNAL_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

export async function handleInvoiceWebhookInternal(
  req: Request,
  res: Response,
): Promise<Response> {
  const event = req.body?.event as Stripe.Event | undefined;
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
    return res.status(400).json({ error: 'event payload is required' });
  }

  // Defensive guard: this endpoint only handles invoice.* events. Anything
  // else is a misrouting — return 400 so callers know their event was rejected
  // (do NOT mark it 'processed' on the legacy side either).
  if (!event.type.startsWith('invoice.')) {
    console.warn(`⚠️ [InvoiceWebhookInternal] non-invoice event ${event.type} rejected`);
    return res.status(400).json({ error: `unsupported event type ${event.type}` });
  }

  console.log(`📥 [InvoiceWebhookInternal] type=${event.type} id=${event.id}`);

  try {
    const result = await InvoiceFirstWebhookService.processEventWithDeduplication(event);
    if (!result.success) {
      // 5xx → Stripe / Next layer should retry.
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [InvoiceWebhookInternal] processing crashed:', message);
    return res.status(500).json({ success: false, error: message });
  }
}

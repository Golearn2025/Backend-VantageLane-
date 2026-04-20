/**
 * Stripe Invoice First — Express handlers (Phase 1)
 *
 * Two server-to-server endpoints called exclusively from the Next.js API
 * proxies (vantage-lane-2.0). Protected by a shared internal secret to keep
 * them off the public attack surface.
 *
 *   POST /api/stripe/corporate-invoice   { bookingId } → InvoiceFlowService.createForCorporate
 *   POST /api/stripe/instant-invoice     { bookingId } → InvoiceFlowService.createForInstant
 *
 * INTERDICTIONS:
 *   - These handlers MUST NOT be called from a browser directly.
 *   - They MUST NOT be wired into the legacy /api/stripe/payment-intent flow.
 *   - They MUST NOT be enabled until the corresponding env feature flags are set.
 */

import { Request, Response, NextFunction } from 'express';
import { InvoiceFlowService } from '../../services/InvoiceFlowService';

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';
const CORP_FLAG = process.env.STRIPE_INVOICE_FIRST_CORPORATE_ENABLED === 'true';
const INSTANT_FLAG = process.env.STRIPE_INVOICE_FIRST_INSTANT_ENABLED === 'true';

/**
 * Internal-only auth: requires `x-internal-secret` to match INTERNAL_API_SECRET.
 * Returns 401 on mismatch. If the secret is not configured server-side, blocks
 * all requests (fail-closed) to prevent accidental public exposure.
 */
export function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_SECRET) {
    console.error('❌ [InvoiceFlow] INTERNAL_API_SECRET not set — blocking all requests');
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

export async function handleCorporateInvoice(req: Request, res: Response) {
  if (!CORP_FLAG) {
    return res.status(503).json({ error: 'invoice_first_corporate disabled' });
  }
  const bookingId = req.body?.bookingId;
  if (typeof bookingId !== 'string' || bookingId.length === 0) {
    return res.status(400).json({ error: 'bookingId is required' });
  }

  console.log(`📥 [InvoiceFlow] POST /corporate-invoice booking=${bookingId}`);
  const result = await InvoiceFlowService.createForCorporate(bookingId);

  if (!result.success) {
    return res.status(500).json({ error: result.error ?? 'Unknown error' });
  }
  return res.status(200).json({
    success: true,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    hostedInvoiceUrl: result.hostedInvoiceUrl,
    alreadyExists: result.alreadyExists ?? false,
    alreadyPaid: result.alreadyPaid ?? false,
  });
}

export async function handleInstantInvoice(req: Request, res: Response) {
  if (!INSTANT_FLAG) {
    return res.status(503).json({ error: 'invoice_first_instant disabled' });
  }
  const bookingId = req.body?.bookingId;
  if (typeof bookingId !== 'string' || bookingId.length === 0) {
    return res.status(400).json({ error: 'bookingId is required' });
  }

  console.log(`📥 [InvoiceFlow] POST /instant-invoice booking=${bookingId}`);
  const result = await InvoiceFlowService.createForInstant(bookingId);

  if (!result.success) {
    return res.status(500).json({ error: result.error ?? 'Unknown error' });
  }
  // alreadyPaid short-circuits the missing client_secret check (paid invoices
  // do not need to be paid again from the UI).
  if (!result.alreadyPaid && !result.clientSecret) {
    return res.status(500).json({ error: 'Stripe did not return a client secret' });
  }
  return res.status(200).json({
    success: true,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    hostedInvoiceUrl: result.hostedInvoiceUrl,
    clientSecret: result.clientSecret,
    alreadyExists: result.alreadyExists ?? false,
    alreadyPaid: result.alreadyPaid ?? false,
  });
}

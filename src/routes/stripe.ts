/**
 * Stripe Routes - Webhook processing
 * 
 * Handles Stripe webhook events for payment confirmation
 */

import { Router, json } from 'express';
import { handleStripeWebhook } from '../api/stripe/webhook';
import {
  handleCorporateInvoice,
  handleInstantInvoice,
  requireInternalSecret,
} from '../api/stripe/invoiceFlow';
import {
  handleInvoiceWebhookInternal,
  requireInvoiceWebhookSecret,
} from '../api/stripe/invoiceWebhookInternal';

const router = Router();

/**
 * @route POST /api/stripe/webhook
 * @desc Handle Stripe webhook events
 * @access Public (but signature verified)
 */
router.post('/webhook', handleStripeWebhook);

/**
 * @route POST /api/stripe/corporate-invoice
 * @desc Stripe Invoice First — corporate (send_invoice + Hosted Invoice Page)
 * @access Internal only (server-to-server, x-internal-secret header)
 */
router.post(
  '/corporate-invoice',
  json(),
  requireInternalSecret,
  handleCorporateInvoice,
);

/**
 * @route POST /api/stripe/instant-invoice
 * @desc Stripe Invoice First — instant (charge_automatically + Payment Element)
 * @access Internal only (server-to-server, x-internal-secret header)
 */
router.post(
  '/instant-invoice',
  json(),
  requireInternalSecret,
  handleInstantInvoice,
);

/**
 * @route POST /api/stripe/invoice-webhook-internal
 * @desc Internal forward of invoice.* Stripe events from the dedicated Next.js
 *       webhook (signature already verified there). Dispatches to
 *       InvoiceFirstWebhookService for dedup + handler invocation.
 * @access Internal only (server-to-server, x-internal-secret header)
 */
router.post(
  '/invoice-webhook-internal',
  json({ limit: '2mb' }),
  requireInvoiceWebhookSecret,
  handleInvoiceWebhookInternal,
);

/**
 * @route GET /api/stripe/health
 * @desc Health check for Stripe webhook service
 * @access Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Stripe Webhook Service',
    status: 'healthy',
    webhook_endpoint: '/api/stripe/webhook',
    timestamp: new Date().toISOString()
  });
});

export default router;

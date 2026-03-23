/**
 * Stripe Routes - Webhook processing
 * 
 * Handles Stripe webhook events for payment confirmation
 */

import { Router } from 'express';
import { handleStripeWebhook } from '../api/stripe/webhook';

const router = Router();

/**
 * @route POST /api/stripe/webhook
 * @desc Handle Stripe webhook events
 * @access Public (but signature verified)
 */
router.post('/webhook', handleStripeWebhook);

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

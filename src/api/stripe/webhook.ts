/**
 * Stripe Webhook Handler
 * 
 * Processes Stripe webhook events to confirm payments and update bookings
 */

import { Request, Response } from 'express';
import Stripe from 'stripe';
import { WebhookService } from '../../services/WebhookService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  try {
    // 1. Verify webhook signature (using raw body)
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      console.error('❌ Webhook: Missing Stripe signature');
      return res.status(400).json({ error: 'Missing signature' });
    }

    let event: Stripe.Event;
    try {
      // Use raw body for signature verification
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error('❌ Webhook: Invalid signature:', err);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log(`🔔 Webhook received: ${event.type} (${event.id})`);

    // 2. Process event with proper deduplication
    const result = await WebhookService.processEventWithDeduplication(event);

    if (result.success) {
      console.log(`✅ Webhook: Successfully processed ${event.type}`);
      return res.status(200).json({
        received: true,
        processed: true,
        event_type: event.type,
        result: result.data
      });
    } else {
      console.error(`❌ Webhook: Failed to process ${event.type}:`, result.error);
      return res.status(500).json({
        received: true,
        processed: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Webhook: Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Wave 1: Payment Intent Creation
 * 
 * Creates Stripe payment intent and booking_payments record
 * Links to existing booking from Phase 2B conversion
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PaymentService } from '../../services/PaymentService';

const router = Router();

/**
 * @route POST /api/pricing/create-payment-intent
 * @desc Create payment intent for existing booking
 * @access Public
 */
router.post('/create-payment-intent', [
  body('bookingId')
    .notEmpty()
    .withMessage('Booking ID is required')
    .isUUID()
    .withMessage('Invalid booking ID format'),

  body('quoteId')
    .notEmpty()
    .withMessage('Quote ID is required')
    .isUUID()
    .withMessage('Invalid quote ID format'),

  body('customerData')
    .notEmpty()
    .withMessage('Customer data is required')
    .isObject()
    .withMessage('Customer data must be an object'),

  body('customerData.customerId')
    .notEmpty()
    .withMessage('Customer ID is required'),

  body('customerData.email')
    .isEmail()
    .withMessage('Valid email is required'),

  body('idempotencyKey')
    .optional()
    .isString()
    .withMessage('Idempotency key must be string'),

  // Frontend compatibility: accept amount from body
  body('amount')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Amount must be positive integer')
], async (req: Request, res: Response) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      bookingId,
      quoteId,
      customerData,
      idempotencyKey: bodyIdempotencyKey,
      amount
    } = req.body;

    // Get organizationId from auth context (security)
    // TODO: Implement proper auth middleware
    const organizationId = '9a5caade-4791-4860-93b5-12b1c4fa9830'; // Temporarily hardcoded for testing
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Support idempotency key from header (frontend compatibility)
    const idempotencyKey = bodyIdempotencyKey || req.headers['idempotency-key'] as string;

    console.log('🌊 Wave 1: Creating payment intent');
    console.log(`  Booking ID: ${bookingId}`);
    console.log(`  Quote ID: ${quoteId}`);
    console.log(`  Organization ID: ${organizationId}`);
    console.log(`  Customer: ${customerData.email}`);
    console.log(`  Amount: ${amount || 'from quote'}`);
    console.log(`  Idempotency Key: ${idempotencyKey || 'generated'}`);

    // Create payment intent
    const result = await PaymentService.createPaymentIntent({
      bookingId,
      quoteId,
      organizationId,
      customerData,
      idempotencyKey: idempotencyKey || PaymentService.generateIdempotencyKey()
    });

    if (!result.success) {
      console.error('❌ Wave 1: Payment intent creation failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
        bookingId
      });
    }

    console.log('✅ Wave 1: Payment intent created successfully');
    console.log(`  Payment ID: ${result.paymentId}`);
    console.log(`  Stripe Payment Intent: ${result.stripePaymentIntentId}`);
    console.log(`  Client Secret: ${result.clientSecret?.substring(0, 10)}...`);

    return res.json({
      success: true,
      data: {
        paymentId: result.paymentId,
        bookingId: result.bookingId,
        stripePaymentIntentId: result.stripePaymentIntentId,
        clientSecret: result.clientSecret,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        idempotencyKey: result.idempotencyKey
      }
    });

  } catch (error) {
    console.error('❌ Wave 1: Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      bookingId: req.body?.bookingId
    });
  }
});

export default router;

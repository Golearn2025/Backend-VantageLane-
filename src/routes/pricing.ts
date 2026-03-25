/**
 * Pricing routes - Production endpoints
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { PricingController } from '../controllers/PricingController';
import { VehicleType, BookingType } from '../types/pricing.types';
import { calculateAndQuote } from '../api/pricing/calculate-and-quote';
import { convertQuoteToBooking } from '../api/pricing/convert-quote-to-booking';
import createPaymentIntent from '../api/pricing/create-payment-intent';

const router = Router();

// Validation rules
const pricingValidation = [
  body('pickup').notEmpty().withMessage('Pickup location is required'),
  // Dropoff is required for ONE_WAY, RETURN, FLEET but optional for HOURLY, DAILY
  body('dropoff').custom((value, { req }) => {
    const bookingType = req.body.bookingType;
    // For HOURLY and DAILY, dropoff is optional (chauffeur may stay at pickup)
    if (bookingType === BookingType.HOURLY || bookingType === BookingType.DAILY) {
      return true;
    }
    // For other types, dropoff is required
    if (!value) {
      throw new Error('Dropoff location is required');
    }
    return true;
  }),
  body('vehicleType').isIn(Object.values(VehicleType)).withMessage('Invalid vehicle type'),
  body('bookingType').isIn(Object.values(BookingType)).withMessage('Invalid booking type'),
  body('dateTime').isISO8601().withMessage('Valid dateTime is required'),
  body('distance').optional().isFloat({ min: 0 }).withMessage('Distance must be positive'),
  body('duration').optional().isInt({ min: 0 }).withMessage('Duration must be positive'),
  body('hours').optional().isInt({ min: 1, max: 12 }).withMessage('Hours must be between 1 and 12'),
  body('days').optional().isInt({ min: 1, max: 30 }).withMessage('Days must be between 1 and 30'),
  body('extras').optional().isArray().withMessage('Extras must be an array'),
  body('corporateTier').optional().isIn(['tier1', 'tier2']).withMessage('Invalid corporate tier')
];

// Phase 2A validation (organizationId comes from auth context, not request body)
const calculateAndQuoteValidation = [
  ...pricingValidation
];

// Phase 2B validation for quote to booking conversion
const convertQuoteToBookingValidation = [
  body('quoteId').isUUID().withMessage('Valid quoteId is required'),
  body('customerData.customerId').isUUID().withMessage('Valid customerId is required'),
  body('customerData.firstName').optional().isString().withMessage('firstName must be string'),
  body('customerData.lastName').optional().isString().withMessage('lastName must be string'),
  body('customerData.email').optional().isEmail().withMessage('Valid email is required'),
  body('customerData.phone').optional().isString().withMessage('phone must be string'),
  body('bookingData.passengerCount').optional().isInt({ min: 1, max: 8 }).withMessage('passengerCount must be between 1 and 8'),
  body('bookingData.bagCount').optional().isInt({ min: 0, max: 10 }).withMessage('bagCount must be between 0 and 10'),
  body('bookingData.notes').optional().isString().withMessage('notes must be string'),
  body('bookingData.preferences').optional().isObject().withMessage('preferences must be object')
];

// Wave 1 validation for payment intent creation
const createPaymentIntentValidation = [
  body('bookingId').isUUID().withMessage('Valid bookingId is required'),
  body('quoteId').isUUID().withMessage('Valid quoteId is required'),
  body('customerData.customerId').isUUID().withMessage('Valid customerId is required'),
  body('customerData.email').isEmail().withMessage('Valid email is required'),
  body('idempotencyKey').optional().isString().withMessage('Idempotency key must be string')
];

/**
 * @route POST /api/pricing/calculate
 * @desc Calculate price with provided distance/duration
 * @access Public
 */
router.post('/calculate', pricingValidation, PricingController.calculatePrice);

/**
 * @route POST /api/pricing/calculate-with-commissions
 * @desc Calculate price WITH platform/operator/driver commissions
 * @access Public
 */
router.post('/calculate-with-commissions', pricingValidation, PricingController.calculateWithCommissions);

/**
 * @route POST /api/pricing/calculate-and-quote
 * @desc Phase 2A: Calculate price AND create independent quote
 * @access Public
 */
router.post('/calculate-and-quote', calculateAndQuoteValidation, calculateAndQuote);

/**
 * @route POST /api/pricing/convert-quote-to-booking
 * @desc Phase 2B: Convert independent quote to real booking
 * @access Public
 */
router.post('/convert-quote-to-booking', convertQuoteToBookingValidation, convertQuoteToBooking);

/**
 * @route POST /api/pricing/create-payment-intent
 * @desc Wave 1: Create payment intent for existing booking
 * @access Public
 */
router.post('/create-payment-intent', createPaymentIntentValidation, createPaymentIntent);

/**
 * @route GET /api/pricing/health
 * @desc Health check for pricing service
 * @access Public
 */
router.get('/health', PricingController.healthCheck);

export default router;

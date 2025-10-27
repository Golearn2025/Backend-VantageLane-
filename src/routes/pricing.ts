/**
 * Pricing routes - Production endpoints
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { PricingController } from '../controllers/PricingController';
import { VehicleType, BookingType } from '../types/pricing.types';

const router = Router();

// Validation rules
const pricingValidation = [
  body('pickup').notEmpty().withMessage('Pickup location is required'),
  body('dropoff').notEmpty().withMessage('Dropoff location is required'),
  body('vehicleType').isIn(Object.values(VehicleType)).withMessage('Invalid vehicle type'),
  body('bookingType').isIn(Object.values(BookingType)).withMessage('Invalid booking type'),
  body('dateTime').isISO8601().withMessage('Valid dateTime is required'),
  body('distance').optional().isFloat({ min: 0 }).withMessage('Distance must be positive'),
  body('duration').optional().isInt({ min: 0 }).withMessage('Duration must be positive'),
  body('extras').optional().isArray().withMessage('Extras must be an array'),
  body('corporateTier').optional().isIn(['tier1', 'tier2']).withMessage('Invalid corporate tier')
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
 * @route GET /api/pricing/health
 * @desc Health check for pricing service
 * @access Public
 */
router.get('/health', PricingController.healthCheck);

export default router;

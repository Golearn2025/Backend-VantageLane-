/**
 * Testing routes - Google Maps integration for development
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { TestingController } from '../controllers/TestingController';
import { VehicleType, BookingType } from '../types/pricing.types';

const router = Router();

// Validation rules (same as pricing but no distance/duration required)
const testingValidation = [
  body('pickup').notEmpty().withMessage('Pickup location is required'),
  body('dropoff').notEmpty().withMessage('Dropoff location is required'),
  body('vehicleType').isIn(Object.values(VehicleType)).withMessage('Invalid vehicle type'),
  body('bookingType').isIn(Object.values(BookingType)).withMessage('Invalid booking type'),
  body('dateTime').isISO8601().withMessage('Valid dateTime is required'),
  body('extras').optional().isArray().withMessage('Extras must be an array'),
  body('corporateTier').optional().isIn(['tier1', 'tier2']).withMessage('Invalid corporate tier')
];

/**
 * @route POST /api/testing/calculate-with-maps
 * @desc Calculate price with Google Maps integration
 * @access Public (development only)
 */
router.post('/calculate-with-maps', testingValidation, TestingController.calculatePriceWithMaps);

export default router;

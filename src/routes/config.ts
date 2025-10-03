/**
 * Config routes - Vehicle types, booking types, etc.
 */

import { Router } from 'express';
import { ConfigController } from '../controllers/ConfigController';

const router = Router();

/**
 * @route GET /api/config/vehicle-types
 * @desc Get available vehicle types
 * @access Public
 */
router.get('/vehicle-types', ConfigController.getVehicleTypes);

/**
 * @route GET /api/config/booking-types
 * @desc Get available booking types
 * @access Public
 */
router.get('/booking-types', ConfigController.getBookingTypes);

export default router;

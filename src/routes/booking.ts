/**
 * Booking routes - Booking confirmation and financial snapshots
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { BookingController } from '../controllers/BookingController';

const router = Router();

/**
 * @route POST /api/booking/confirm
 * @desc Confirm booking and create financial snapshot
 * @access Public
 */
router.post('/confirm', [
  body('quoteId').notEmpty().withMessage('Quote ID is required'),
  body('bookingId').notEmpty().withMessage('Booking ID is required'),
  body('organizationId').optional().isString()
], BookingController.confirmBooking);

/**
 * @route GET /api/booking/:bookingId/financials
 * @desc Get booking financial snapshot
 * @access Public
 */
router.get('/:bookingId/financials', BookingController.getBookingFinancials);

export default router;

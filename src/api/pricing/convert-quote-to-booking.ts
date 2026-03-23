/**
 * Phase 2B: Convert Quote to Booking API
 *
 * DESIGN NOTES:
 * - Converts Phase 2A independent quotes to real bookings
 * - Creates proper FK relationships between all entities
 * - Updates quote status (is_current = false)
 * - Returns booking details with leg information
 */

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { QuoteService } from '../../services/QuoteService';

export async function convertQuoteToBooking(req: Request, res: Response) {
  try {
    console.log('🎯 Phase 2B: Convert quote to booking request received');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required - organization ID missing from authenticated context'
      });
    }

    const { quoteId, customerData, bookingData } = req.body;

    if (!quoteId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: quoteId'
      });
    }

    if (!customerData?.customerId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: customerData.customerId'
      });
    }

    const result = await QuoteService.convertQuoteToBooking(
      quoteId,
      organizationId,
      customerData,
      bookingData
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        quoteId
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        bookingId: result.bookingId,
        quoteId: result.quoteId,
        message: 'Quote successfully converted to booking'
      }
    });
  } catch (error: any) {
    console.error('❌ Phase 2B: Error in convert quote to booking endpoint:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Booking Controller
 * 
 * Handles booking confirmation and financial snapshot creation
 */

import { Request, Response } from 'express';
import { FinancialSnapshotService } from '../services/FinancialSnapshotService';
import { QuoteService } from '../services/QuoteService';

export class BookingController {

  /**
   * Confirm booking and create financial snapshot
   * This is called when a customer confirms a quote
   */
  public static async confirmBooking(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId, bookingId, organizationId } = req.body;

      if (!quoteId || !bookingId) {
        res.status(400).json({
          success: false,
          error: 'Quote ID and Booking ID are required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Update quote status to accepted
      await QuoteService.updateQuoteStatus(quoteId, 'accepted');

      // Create financial snapshot
      const snapshotResult = await FinancialSnapshotService.createFinancialSnapshot(
        bookingId,
        quoteId,
        organizationId || 'default-org-id'
      );

      if (!snapshotResult.success) {
        res.status(500).json({
          success: false,
          error: snapshotResult.error || 'Failed to create financial snapshot',
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.json({
        success: true,
        message: 'Booking confirmed and financial snapshot created',
        data: {
          booking_id: bookingId,
          quote_id: quoteId,
          booking_financial_id: snapshotResult.booking_financial_id,
          leg_financial_ids: snapshotResult.leg_financial_ids,
          line_item_ids: snapshotResult.line_item_ids
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Booking confirmation error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get booking financials
   */
  public static async getBookingFinancials(req: Request, res: Response): Promise<void> {
    try {
      const { bookingId } = req.params;

      if (!bookingId) {
        res.status(400).json({
          success: false,
          error: 'Booking ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const financials = await FinancialSnapshotService.getBookingFinancials(bookingId);

      res.json({
        success: true,
        data: financials,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get booking financials error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  }
}

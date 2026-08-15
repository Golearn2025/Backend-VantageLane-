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
import { supabase } from '../../config/supabase';

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

    // Resolve org: an explicit org in the request (e.g. a partner kiosk booking
    // on behalf of its venue) takes precedence so the quote is matched against
    // the tenant that actually owns it, then the header, then the auth context.
    const organizationId =
      req.body?.organizationId ||
      (req.headers['x-organization-id'] as string) ||
      (req as any).user?.organizationId ||
      '00000000-0000-0000-0000-000000000001';

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

    // Look up the quote's actual organization — the quote always knows its own
    // owner regardless of which org the caller claims. This handles the case
    // where a rate-card org (pricingOrgId) differs from the caller's auth org.
    const { data: quoteRow } = await supabase
      .from('client_booking_quotes')
      .select('organization_id')
      .eq('id', quoteId)
      .maybeSingle();

    const resolvedOrgId = quoteRow?.organization_id || organizationId;

    const result = await QuoteService.convertQuoteToBooking(
      quoteId,
      resolvedOrgId,
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
        reference: result.reference,
        amount: result.amount,
        currency: result.currency || 'GBP',
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

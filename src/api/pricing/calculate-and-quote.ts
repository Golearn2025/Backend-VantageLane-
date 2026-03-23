/**
 * Phase 2A: Calculate pricing and create independent quote
 * 
 * DESIGN NOTES:
 * - Creates client-facing independent quotes (booking_id = NULL)
 * - VAT is NOT calculated at quote stage (vat_pence = 0, vat_rate = 0)
 * - Tax treatment applied later when quote converted to booking
 * - API response matches DB persistence exactly
 * 
 * This endpoint:
 * 1. Calculates pricing using PricingEngine
 * 2. Creates independent quote (booking_id = NULL)
 * 3. Returns quote_id + pricing breakdown
 */

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { PricingEngine } from '../../services/PricingEngine';
import { QuoteService } from '../../services/QuoteService';

export async function calculateAndQuote(req: Request, res: Response) {
  try {
    console.log(' Phase 2A: Calculate and Quote request received');

    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Validate request body
    const {
      pickup,
      dropoff,
      vehicleType,
      bookingType,
      dateTime,
      // Optional fields
      distance,
      duration,
      hours,
      days,
      extras,
      corporateTier
    } = req.body;

    // Get organizationId from authenticated context only
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required - organization ID missing from authenticated context'
      });
    }

    // Required fields validation
    if (!pickup || !dropoff || !vehicleType || !bookingType || !dateTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: pickup, dropoff, vehicleType, bookingType, dateTime'
      });
    }

    // Step 1: Calculate pricing using PricingEngine
    console.log('📊 Calculating pricing...');
    const pricingResult = await PricingEngine.calculate({
      pickup,
      dropoff,
      vehicleType,
      bookingType,
      dateTime,
      distance,
      duration,
      hours,
      days,
      extras,
      corporateTier
    });

    if (!pricingResult.success || !pricingResult.breakdown) {
      return res.status(400).json({
        success: false,
        error: 'Pricing calculation failed',
        details: pricingResult
      });
    }

    console.log('✅ Pricing calculated:', {
      finalPrice: pricingResult.finalPrice,
      currency: pricingResult.currency,
      breakdown: pricingResult.breakdown
    });

    // Step 2: Create independent quote (Phase 2A)
    console.log('📝 Creating independent quote...');
    const quoteResult = await QuoteService.createIndependentQuote(
      pricingResult,
      req.body,
      organizationId
    );

    if (!quoteResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create independent quote',
        details: quoteResult.error
      });
    }

    console.log('✅ Independent quote created:', quoteResult.booking_quote_id);

    // Step 3: Return success response
    const response = {
      success: true,
      data: {
        quoteId: quoteResult.booking_quote_id,
        pricing: {
          finalPrice: pricingResult.finalPrice,
          currency: pricingResult.currency || 'GBP',
          breakdown: pricingResult.breakdown,
          details: pricingResult.details
        },
        quote: {
          id: quoteResult.booking_quote_id,
          type: 'independent', // Phase 2A
          createdAt: new Date().toISOString()
        }
      }
    };

    console.log('🎉 Phase 2A Calculate and Quote completed successfully');
    return res.status(201).json(response);

  } catch (error) {
    console.error('❌ Error in calculateAndQuote:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

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
import { PricingEngine } from '../../services/PricingEngine';
import { QuotePersistenceService } from '../../services/quotes';
import { validatePricingRequest } from '../../validators/pricingRequestValidator';
import { parsePricingRequest } from '../../parsers/pricingRequestParser';
import { PricingRequestData } from '../../types/pricing.types';

export async function calculateAndQuote(req: Request, res: Response) {
  try {
    console.log('🎯 Phase 2A: Calculate and Quote request received');

    // Get organizationId from authenticated context
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required - organization ID missing from authenticated context'
      });
    }

    // Build PricingRequestData from request body
    const requestData: PricingRequestData = {
      ...req.body,
      organizationId // Inject from auth context
    };

    // Step 1: Validate request using new validator
    console.log('✅ Validating pricing request...');
    const validationResult = validatePricingRequest(requestData);
    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.errors
      });
    }

    // Step 2: Parse request into normalized format
    console.log('🔄 Parsing pricing request...');
    const parseResult = parsePricingRequest(requestData);
    if (!parseResult.success || !parseResult.data) {
      return res.status(400).json({
        success: false,
        error: 'Parse failed',
        details: parseResult.errors
      });
    }

    const normalizedRequest = parseResult.data;

    // Step 3: Calculate pricing using PricingEngine with normalized request
    console.log('📊 Calculating pricing...');
    const pricingResult = await PricingEngine.calculate(normalizedRequest);

    if (!pricingResult.success || !pricingResult.bookingBreakdown) {
      return res.status(400).json({
        success: false,
        error: 'Pricing calculation failed',
        details: pricingResult
      });
    }

    console.log('✅ Pricing calculated:', {
      finalPrice: pricingResult.finalPrice,
      currency: pricingResult.currency,
      breakdown: pricingResult.bookingBreakdown
    });

    // Step 4: Create independent quote (Phase 2A)
    console.log('📝 Creating independent quote...');
    const quoteResult = await QuotePersistenceService.createIndependentQuote(
      pricingResult,
      normalizedRequest,
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

    // Step 5: Return success response
    const response = {
      success: true,
      data: {
        quoteId: quoteResult.booking_quote_id,
        pricing: {
          finalPrice: pricingResult.finalPrice,
          currency: pricingResult.currency || 'GBP',
          breakdown: pricingResult.bookingBreakdown,
          legs: pricingResult.legs,
          details: pricingResult.bookingBreakdown?.details
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

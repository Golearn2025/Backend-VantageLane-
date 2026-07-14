/**
 * Phase 2A: Calculate pricing and create independent quote
 * 
 * DESIGN NOTES:
 * - Creates client-facing independent quotes (booking_id = NULL)
 * - VAT from organization_settings.vat_rate (0 = same client total as engine net)
 * - API response matches DB persistence exactly
 * 
 * This endpoint:
 * 1. Calculates pricing using PricingEngine
 * 2. Creates independent quote (booking_id = NULL)
 * 3. Returns quote_id + pricing breakdown
 */

import { Request, Response } from 'express';
import { PricingEngine } from '../../services/PricingEngine';
import { OrganizationSettingsService } from '../../services/OrganizationSettingsService';
import { QuoteAmountsMapper } from '../../services/mappers/quoteAmountsMapper';
import { QuotePersistenceService } from '../../services/quotes';
import { QuoteEconomicsMapper } from '../../services/pricing-validation/QuoteEconomicsMapper';
import { OrganizationFinancialSettingsService } from '../../services/OrganizationFinancialSettingsService';
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
    console.log('📋 Request data:', JSON.stringify(requestData, null, 2));
    const validationResult = validatePricingRequest(requestData);
    if (!validationResult.valid) {
      console.error('❌ VALIDATION FAILED:', JSON.stringify(validationResult.errors, null, 2));
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.errors
      });
    }

    // Step 2: Parse and normalize request
    const parseResult = parsePricingRequest(requestData);

    if (!parseResult.success || !parseResult.data) {
      return res.status(400).json({
        success: false,
        error: 'Parse failed',
        details: parseResult.errors
      });
    }

    const normalizedRequest = parseResult.data;

    // LOG 1: Immediately after parser
    console.error('� LOG 1 - AFTER PARSER normalizedRequest =', JSON.stringify(normalizedRequest, null, 2));

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

    // Phase 1C: quote-time economics snapshot (visibility only — no validation/blocking)
    const [orgSettings, financialSettings] = await Promise.all([
      OrganizationSettingsService.getOrganizationSettings(organizationId),
      OrganizationFinancialSettingsService.getOrganizationFinancialSettings(organizationId),
    ]);

    const economicsSnapshot = await QuoteEconomicsMapper.buildSnapshot({
      pricingResult,
      normalizedRequest,
      organizationId,
      organizationSettings: orgSettings,
      financialSettings,
    });

    console.log('📊 Quote economics snapshot generated:', {
      client_gross_pence: economicsSnapshot.client_gross_pence,
      estimated_margin_bps: economicsSnapshot.estimated_margin_pct,
      schema_version: economicsSnapshot.schema_version,
    });

    // Step 4: Create independent quote (Phase 2A)
    console.log('📝 Creating independent quote...');

    // LOG 1: Immediately before createIndependentQuote
    console.error('🔴 LOG 1 - BEFORE createIndependentQuote normalizedRequest =', JSON.stringify(normalizedRequest, null, 2));

    const quoteResult = await QuotePersistenceService.createIndependentQuote(
      pricingResult,
      normalizedRequest,
      organizationId,
      { economicsSnapshot }
    );

    if (!quoteResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create independent quote',
        details: quoteResult.error
      });
    }

    console.log('✅ Independent quote created:', quoteResult.booking_quote_id);

    const clientAmounts = QuoteAmountsMapper.calculateIndependentQuoteAmounts(
      pricingResult,
      orgSettings.vat_rate
    );
    const clientTotal =
      Math.round((clientAmounts.totalPence / 100) * 100) / 100;
    const priceBeforeVAT =
      Math.round((clientAmounts.netPence / 100) * 100) / 100;
    const vatAmount =
      Math.round((clientAmounts.vatPence / 100) * 100) / 100;

    // Step 5: Return success response (finalPrice = what client pays, incl. VAT if configured)
    const response = {
      success: true,
      data: {
        quoteId: quoteResult.booking_quote_id,
        pricing: {
          finalPrice: clientTotal,
          priceBeforeVAT,
          vatAmount,
          vatRate: clientAmounts.vatRate,
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

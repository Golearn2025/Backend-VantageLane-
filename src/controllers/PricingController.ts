/**
 * Main Pricing Controller - Focused and clean
 */

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { PricingEngine } from '../services/PricingEngine';
import { QuoteService } from '../services/QuoteService';
import { OrganizationSettingsService } from '../services/OrganizationSettingsService';
import { PricingRequestData } from '../types/pricing.types';
import { parsePricingRequest } from '../parsers/pricingRequestParser';

export class PricingController {

  /**
   * Calculate price with provided distance/duration (production endpoint)
   * Now includes quote persistence
   */
  public static async calculatePrice(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
          timestamp: new Date().toISOString()
        });
        return;
      }

      const organizationId = req.body.organizationId || 
                            req.headers['x-organization-id'] as string || 
                            process.env.DEFAULT_ORGANIZATION_ID || 
                            '9a5caade-4791-4860-93b5-12b1c4fa9830';

      const requestData: PricingRequestData = {
        ...req.body,
        organizationId,
      };

      const parseResult = parsePricingRequest(requestData);
      if (!parseResult.success || !parseResult.data) {
        res.status(400).json({ success: false, error: 'Invalid request', details: parseResult.errors, timestamp: new Date().toISOString() });
        return;
      }
      const normalizedRequest = parseResult.data;

      // Calculate pricing
      const result = await PricingEngine.calculate(normalizedRequest);
      
      if (!result.success) {
        res.json(result);
        return;
      }

      // Persist quote to database
      const quoteResult = await QuoteService.createQuote(
        result,
        normalizedRequest,
        organizationId || 'default-org-id'
      );

      // Add quote IDs to response
      const response = {
        ...result,
        quote_id: quoteResult.booking_quote_id,
        leg_quote_ids: quoteResult.leg_quote_ids
      };
      
      res.json(response);

    } catch (error) {
      console.error('Pricing calculation error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Calculate price WITH commissions and VAT
   * Commissions and VAT rates fetched from organization_settings
   */
  public static async calculateWithCommissions(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
          timestamp: new Date().toISOString()
        });
        return;
      }

      const organizationId = req.body.organizationId || 
                            req.headers['x-organization-id'] as string || 
                            process.env.DEFAULT_ORGANIZATION_ID || 
                            '9a5caade-4791-4860-93b5-12b1c4fa9830';

      const requestData: PricingRequestData = {
        ...req.body,
        organizationId,
      };

      const parseResult2 = parsePricingRequest(requestData);
      if (!parseResult2.success || !parseResult2.data) {
        res.status(400).json({ success: false, error: 'Invalid request', details: parseResult2.errors, timestamp: new Date().toISOString() });
        return;
      }
      const normalizedRequest2 = parseResult2.data;

      // Get organization settings (commission rates, VAT)
      const settings = await OrganizationSettingsService.getOrganizationSettings(organizationId);

      // Calculate base price
      const baseResult = await PricingEngine.calculate(normalizedRequest2);
      
      if (!baseResult.success) {
        res.json(baseResult);
        return;
      }

      const priceBeforeVAT = baseResult.finalPrice || 0;

      // Calculate VAT
      const vatAmount = priceBeforeVAT * settings.vat_rate;
      const priceWithVAT = priceBeforeVAT + vatAmount;

      // Calculate commissions (on price before VAT)
      const platformFee = priceBeforeVAT * settings.platform_commission_pct;
      const operatorNet = priceBeforeVAT - platformFee;
      const operatorCommission = operatorNet * settings.operator_commission_pct;
      const driverPayout = operatorNet - operatorCommission;

      // Persist quote to database
      const quoteResult = await QuoteService.createQuote(
        baseResult,
        normalizedRequest2,
        organizationId || 'default-org-id'
      );

      res.json({
        ...baseResult,
        quote_id: quoteResult.booking_quote_id,
        leg_quote_ids: quoteResult.leg_quote_ids,
        pricing: {
          priceBeforeVAT: Math.round(priceBeforeVAT * 100) / 100,
          vatAmount: Math.round(vatAmount * 100) / 100,
          vatRate: settings.vat_rate,
          priceWithVAT: Math.round(priceWithVAT * 100) / 100,
          currency: settings.currency
        },
        commissions: {
          platformFee: Math.round(platformFee * 100) / 100,
          platformCommissionPct: settings.platform_commission_pct,
          operatorNet: Math.round(operatorNet * 100) / 100,
          operatorCommission: Math.round(operatorCommission * 100) / 100,
          operatorCommissionPct: settings.operator_commission_pct,
          driverPayout: Math.round(driverPayout * 100) / 100
        }
      });

    } catch (error) {
      console.error('Pricing with commissions error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Health check endpoint
   */
  public static healthCheck(req: Request, res: Response): void {
    res.json({
      success: true,
      service: 'Vantage Lane Pricing Engine',
      version: '1.0.0',
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  }
}

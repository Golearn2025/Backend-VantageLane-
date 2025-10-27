/**
 * Main Pricing Controller - Focused and clean
 */

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { PricingEngine } from '../services/PricingEngine';
import { PricingRequestData } from '../types/pricing.types';

export class PricingController {

  /**
   * Calculate price with provided distance/duration (production endpoint)
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

      const requestData: PricingRequestData = req.body;
      const result = await PricingEngine.calculate(requestData);
      
      res.json(result);

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
   * Calculate price WITH commissions (Platform + Operator + Driver)
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

      const requestData: PricingRequestData = req.body;
      const platformCommissionPct = req.body.platformCommissionPct || 0.10;
      const operatorCommissionPct = req.body.operatorCommissionPct || 0.10;

      // Calculate base price
      const baseResult = await PricingEngine.calculate(requestData);
      
      if (!baseResult.success) {
        res.json(baseResult);
        return;
      }

      const customerPrice = baseResult.finalPrice || 0;

      // Calculate commissions
      const platformFee = customerPrice * platformCommissionPct;
      const operatorNet = customerPrice - platformFee;
      const operatorCommission = operatorNet * operatorCommissionPct;
      const driverPayout = operatorNet - operatorCommission;

      res.json({
        ...baseResult,
        customerPrice,
        commissions: {
          platformFee: Math.round(platformFee * 100) / 100,
          platformCommissionPct,
          operatorNet: Math.round(operatorNet * 100) / 100,
          operatorCommission: Math.round(operatorCommission * 100) / 100,
          operatorCommissionPct,
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

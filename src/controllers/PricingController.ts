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
      const result = PricingEngine.calculate(requestData);
      
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

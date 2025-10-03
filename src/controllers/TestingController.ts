/**
 * Testing Controller - Google Maps integration for testing
 */

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { PricingEngine } from '../services/PricingEngine';
import { GoogleMapsService } from '../services/GoogleMapsService';
import { PricingRequestData } from '../types/pricing.types';

export class TestingController {

  /**
   * Calculate price with Google Maps integration (testing endpoint)
   */
  public static async calculatePriceWithMaps(req: Request, res: Response): Promise<void> {
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

      const { pickup, dropoff, vehicleType, bookingType, dateTime, extras, corporateTier } = req.body;

      // Get distance and duration from Google Maps
      const mapsData = await GoogleMapsService.getDistanceAndDuration(pickup, dropoff);
      
      if (!mapsData.success) {
        res.status(400).json({
          success: false,
          error: mapsData.error || 'Failed to get route information',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Create enhanced request with Maps data
      const requestData: PricingRequestData = {
        pickup,
        dropoff,
        vehicleType,
        bookingType,
        dateTime,
        distance: mapsData.distance,
        duration: mapsData.duration,
        coordinates: mapsData.coordinates,
        extras,
        corporateTier
      };

      // Calculate pricing
      const result = PricingEngine.calculate(requestData);

      // Add route info to response
      const enhancedResult = {
        ...result,
        route: {
          distance: `${mapsData.distance?.toFixed(1)} km`,
          duration: `${mapsData.duration} minutes`,
          coordinates: mapsData.coordinates
        }
      };

      res.json(enhancedResult);

    } catch (error) {
      console.error('Testing calculation error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  }
}

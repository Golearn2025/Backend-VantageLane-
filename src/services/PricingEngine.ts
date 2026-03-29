/**
 * Core Pricing Engine - Refactored to use database views
 *
 * CHANGES FROM OLD VERSION:
 * - Removed PricingConfigService and PricingConfigAdapter dependencies
 * - Now uses PricingDataService to read from normalized views
 * - All calculator methods are now async
 * - Business logic remains UNCHANGED
 */

import {
  BookingType,
  PricingBreakdownData,
  PricingRequestData,
  PricingResult,
  VehicleType,
  NormalizedPricingRequest,
  NormalizedOneWayRequest,
  NormalizedReturnRequest,
  NormalizedHourlyRequest,
  NormalizedDailyRequest,
  NormalizedFleetRequest
} from '../types/pricing.types';
import { PricingHelpers } from '../utils/PricingHelpers';
import { BookingTypeHandlers } from './BookingTypeHandlers';
import { FeeCalculators } from './FeeCalculators';
import { PricingDataService } from './PricingDataService';
import { handleOneWayPricing } from '../handlers/oneWayPricingHandler';
import { handleReturnPricing } from '../handlers/returnPricingHandler';
import { handleHourlyPricing } from '../handlers/hourlyPricingHandler';
import { handleDailyPricing } from '../handlers/dailyPricingHandler';
import { handleFleetPricing } from '../handlers/fleetPricingHandler';

export class PricingEngine {

  /**
   * Main method to calculate pricing
   * 
   * MIGRATION STATUS:
   * - ONE_WAY: Uses new handleOneWayPricing() ✅
   * - RETURN: Uses new handleReturnPricing() ✅
   * - HOURLY: Uses new handleHourlyPricing() ✅
   * - DAILY: Uses new handleDailyPricing() ✅
   * - FLEET: Uses new handleFleetPricing() ✅
   * 
   * ALL BOOKING TYPES MIGRATED! 🎉
   */
  public static async calculate(request: NormalizedPricingRequest): Promise<PricingResult> {
    try {
      // NEW FLOW: ONE_WAY uses dedicated handler
      if (request.bookingType === BookingType.ONE_WAY) {
        return await handleOneWayPricing({
          request: request as NormalizedOneWayRequest
        });
      }

      // NEW FLOW: RETURN uses dedicated handler
      if (request.bookingType === BookingType.RETURN) {
        return await handleReturnPricing({
          request: request as NormalizedReturnRequest
        });
      }

      // NEW FLOW: HOURLY uses dedicated handler
      if (request.bookingType === BookingType.HOURLY) {
        return await handleHourlyPricing({
          request: request as NormalizedHourlyRequest
        });
      }

      // NEW FLOW: DAILY uses dedicated handler
      if (request.bookingType === BookingType.DAILY) {
        return await handleDailyPricing({
          request: request as NormalizedDailyRequest
        });
      }

      // NEW FLOW: FLEET uses dedicated handler
      if (request.bookingType === BookingType.FLEET) {
        return await handleFleetPricing({
          request: request as NormalizedFleetRequest
        });
      }

      // Unknown booking type - should never reach here after validation
      return {
        success: false,
        error: `Unsupported booking type: ${(request as any).bookingType}`,
        code: 400,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('Pricing calculation error:', error);
      return {
        success: false,
        error: error.message || 'Internal pricing calculation error',
        code: 500,
        timestamp: new Date().toISOString()
      };
    }
  }
}

/**
 * Core Pricing Engine - Orchestrator
 * Delegates fee calculations to FeeCalculators and booking logic to BookingTypeHandlers
 */

import { 
  PricingRequestData, 
  PricingResult, 
  VehicleType, 
  BookingType,
  PricingBreakdownData,
  PricingConfig
} from '../types/pricing.types';
import { PricingConfigService } from './PricingConfigService';
import { PricingConfigAdapter } from './PricingConfigAdapter';
import { PricingHelpers } from '../utils/PricingHelpers';
import { FeeCalculators } from './FeeCalculators';
import { BookingTypeHandlers } from './BookingTypeHandlers';

export class PricingEngine {
  // Pricing config - loaded from Supabase
  private static PRICING_CONFIG: PricingConfig;
  
  /**
   * Main method to calculate pricing
   */
  public static async calculate(request: PricingRequestData): Promise<PricingResult> {
    try {
      // Validate request
      const validationError = this.validateRequest(request);
      if (validationError) {
        return this.createErrorResponse(validationError, 400);
      }

      // Fetch pricing config from Supabase (with caching)
      const dbConfig = await PricingConfigService.getActivePricingConfig();
      this.PRICING_CONFIG = PricingConfigAdapter.toPricingConfig(dbConfig);
      const config = this.PRICING_CONFIG;

      // Initialize breakdown
      const breakdown: PricingBreakdownData = {
        baseFare: 0,
        distanceFee: 0, 
        timeFee: 0,
        airportFees: 0,
        zoneFees: 0,
        tollFees: 0,
        multiStopFees: 0,
        waitingFees: 0,
        extraServices: 0,
        subtotal: 0,
        multipliers: {},
        discounts: 0,
        finalPrice: 0,
        details: []
      };

      // Step 1: Base fare (NOT for hourly/daily bookings - those are flat rate)
      if (request.bookingType !== BookingType.HOURLY && request.bookingType !== BookingType.DAILY) {
        FeeCalculators.calculateBaseFare(breakdown, request, config);
      }

      // Step 2: Calculate main fare (distance/time vs hourly vs daily)
      if (request.bookingType === BookingType.HOURLY) {
        FeeCalculators.calculateHourlyFee(breakdown, request, config);
      } else if (request.bookingType === BookingType.DAILY) {
        FeeCalculators.calculateDailyFee(breakdown, request, config);
      } else {
        if (request.distance) {
          FeeCalculators.calculateDistanceFee(breakdown, request, config);
        }
        if (request.duration) {
          FeeCalculators.calculateTimeFee(breakdown, request, config);
        }
      }

      // Step 3: Zone fees (airports, congestion)
      FeeCalculators.calculateZoneFees(breakdown, request, config);

      // Step 4: Toll roads detection
      await FeeCalculators.calculateTollFees(breakdown, request, config);

      // Step 5: Additional services
      await FeeCalculators.calculateAdditionalServices(breakdown, request, config);

      // Step 6: Calculate subtotal
      breakdown.subtotal = breakdown.baseFare + breakdown.distanceFee + breakdown.timeFee + 
                          breakdown.airportFees + breakdown.zoneFees + breakdown.tollFees + 
                          breakdown.multiStopFees + breakdown.waitingFees + breakdown.extraServices;

      // Step 7: Apply RETURN trip logic (x2 with discount)
      if (request.bookingType === BookingType.RETURN) {
        BookingTypeHandlers.applyReturnTripLogic(breakdown, request, config);
      }

      // Step 8: Apply FLEET logic (multiple vehicles)
      if (request.bookingType === BookingType.FLEET && request.fleetConfig) {
        BookingTypeHandlers.applyFleetLogic(breakdown, request, config);
      }

      // Step 9: Apply multipliers
      FeeCalculators.applyMultipliers(breakdown, request, config);

      // Step 10: Apply discounts
      FeeCalculators.applyDiscounts(breakdown, request, config);

      // Step 11: Check minimum fare
      FeeCalculators.applyMinimumFare(breakdown, request, config);

      // Step 12: Apply rounding
      const priceBeforeRounding = breakdown.finalPrice || (breakdown.subtotal - breakdown.discounts);
      breakdown.finalPrice = PricingHelpers.applyRounding(
        priceBeforeRounding, 
        config.policies.rounding
      );

      return this.createSuccessResponse(breakdown, request);

    } catch (error) {
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Internal calculation error', 
        500
      );
    }
  }

  /**
   * Validate pricing request
   */
  private static validateRequest(request: PricingRequestData): string | null {
    if (!request.pickup || !request.dropoff) {
      return 'Pickup and dropoff locations are required';
    }
    
    if (!Object.values(VehicleType).includes(request.vehicleType)) {
      return 'Invalid vehicle type';
    }
    
    if (!Object.values(BookingType).includes(request.bookingType)) {
      return 'Invalid booking type';
    }

    if (!request.dateTime || isNaN(Date.parse(request.dateTime))) {
      return 'Valid dateTime is required';
    }

    return null;
  }

  /**
   * Create success response
   */
  private static createSuccessResponse(breakdown: PricingBreakdownData, request: PricingRequestData): PricingResult {
    const result: PricingResult = {
      success: true,
      finalPrice: breakdown.finalPrice,
      currency: 'GBP',
      breakdown: {
        baseFare: breakdown.baseFare,
        distanceFee: breakdown.distanceFee,
        timeFee: breakdown.timeFee,
        additionalFees: breakdown.airportFees + breakdown.zoneFees + breakdown.tollFees,
        services: breakdown.extraServices + breakdown.multiStopFees + breakdown.waitingFees,
        subtotal: breakdown.subtotal,
        multipliers: breakdown.multipliers,
        discounts: breakdown.discounts,
        finalPrice: breakdown.finalPrice
      },
      details: breakdown.details,
      timestamp: new Date().toISOString()
    };

    // Generate legs breakdown for RETURN bookings
    if (request.bookingType === BookingType.RETURN) {
      result.legs = BookingTypeHandlers.generateReturnLegs(breakdown, request);
    }

    // Generate legs breakdown for FLEET bookings
    if (request.bookingType === BookingType.FLEET && request.fleetConfig) {
      const { legs, summary } = BookingTypeHandlers.generateFleetLegs(breakdown, request, this.PRICING_CONFIG);
      result.legs = legs;
      result.fleet_summary = summary;
    }

    return result;
  }

  /**
   * Create error response
   */
  private static createErrorResponse(message: string, code: number): PricingResult {
    return {
      success: false,
      error: message,
      code,
      timestamp: new Date().toISOString()
    };
  }
}

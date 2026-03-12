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
  PricingRequestData, 
  PricingResult, 
  VehicleType, 
  BookingType,
  PricingBreakdownData
} from '../types/pricing.types';
import { PricingDataService } from './PricingDataService';
import { PricingHelpers } from '../utils/PricingHelpers';
import { FeeCalculators } from './FeeCalculators';
import { BookingTypeHandlers } from './BookingTypeHandlers';

export class PricingEngine {
  
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

      // Capture pricing_version_id from first pricing query
      let pricingVersionId: string | undefined;

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
        await FeeCalculators.calculateBaseFare(breakdown, request);
        // Capture pricing_version_id from vehicle rates
        const rates = await PricingDataService.getVehicleRates(
          request.vehicleType,
          request.bookingType,
          request.organizationId
        );
        pricingVersionId = rates.pricing_version_id;
      }

      // Step 2: Calculate main fare (distance/time vs hourly vs daily)
      if (request.bookingType === BookingType.HOURLY) {
        await FeeCalculators.calculateHourlyFee(breakdown, request);
        // Capture pricing_version_id from hourly rules
        const hourlyRules = await PricingDataService.getHourlyRules(
          request.vehicleType,
          request.organizationId
        );
        pricingVersionId = hourlyRules.pricing_version_id;
      } else if (request.bookingType === BookingType.DAILY) {
        await FeeCalculators.calculateDailyFee(breakdown, request);
        // Capture pricing_version_id from daily rules
        const dailyRules = await PricingDataService.getDailyRules(
          request.vehicleType,
          request.organizationId
        );
        pricingVersionId = dailyRules.pricing_version_id;
      } else {
        if (request.distance) {
          await FeeCalculators.calculateDistanceFee(breakdown, request);
        }
        if (request.duration) {
          await FeeCalculators.calculateTimeFee(breakdown, request);
        }
      }

      // Step 3: Zone fees (airports, congestion)
      await FeeCalculators.calculateZoneFees(breakdown, request);

      // Step 4: Toll roads detection
      await FeeCalculators.calculateTollFees(breakdown, request);

      // Step 5: Additional services
      await FeeCalculators.calculateAdditionalServices(breakdown, request);

      // Calculate subtotal before booking type logic
      breakdown.subtotal = 
        breakdown.baseFare +
        breakdown.distanceFee +
        breakdown.timeFee +
        breakdown.airportFees +
        breakdown.zoneFees +
        breakdown.tollFees +
        breakdown.multiStopFees +
        breakdown.waitingFees +
        breakdown.extraServices;

      // Step 6: Apply booking type specific logic (RETURN or FLEET)
      if (request.bookingType === BookingType.RETURN) {
        await BookingTypeHandlers.applyReturnTripLogic(breakdown, request);
      } else if (request.bookingType === BookingType.FLEET) {
        await BookingTypeHandlers.applyFleetLogic(breakdown, request);
      }

      // Step 7: Apply time-based multipliers (only for non-hourly/daily bookings)
      if (request.bookingType !== BookingType.HOURLY && request.bookingType !== BookingType.DAILY) {
        await FeeCalculators.applyMultipliers(breakdown, request);
      }

      // Step 8: Apply corporate discounts
      await FeeCalculators.applyDiscounts(breakdown, request);

      // Step 9: Apply minimum fare
      await FeeCalculators.applyMinimumFare(breakdown, request);

      // Step 10: Apply rounding policy
      const roundingRules = await PricingDataService.getRoundingRules();
      const priceBeforeRounding = breakdown.finalPrice || (breakdown.subtotal - breakdown.discounts);
      breakdown.finalPrice = PricingHelpers.applyRounding(
        priceBeforeRounding, 
        {
          to: roundingRules.round_to_pence ? roundingRules.round_to_pence / 100 : 5,
          direction: roundingRules.direction || 'up'
        }
      );

      return this.createSuccessResponse(breakdown, request, pricingVersionId);

    } catch (error: any) {
      console.error('Pricing calculation error:', error);
      return this.createErrorResponse(
        error.message || 'Internal pricing calculation error',
        500
      );
    }
  }

  /**
   * Validate pricing request
   */
  private static validateRequest(request: PricingRequestData): string | null {
    if (!request.vehicleType) {
      return 'Vehicle type is required';
    }

    if (!request.bookingType) {
      return 'Booking type is required';
    }

    if (!Object.values(VehicleType).includes(request.vehicleType)) {
      return `Invalid vehicle type: ${request.vehicleType}`;
    }

    if (!Object.values(BookingType).includes(request.bookingType)) {
      return `Invalid booking type: ${request.bookingType}`;
    }

    if (request.bookingType === BookingType.HOURLY && !request.hours) {
      return 'Hours are required for hourly bookings';
    }

    if (request.bookingType === BookingType.DAILY && !request.days) {
      return 'Days are required for daily bookings';
    }

    if (request.bookingType === BookingType.FLEET && !request.fleetConfig) {
      return 'Fleet configuration is required for fleet bookings';
    }

    return null;
  }

  /**
   * Create success response with breakdown
   */
  private static async createSuccessResponse(
    breakdown: PricingBreakdownData, 
    request: PricingRequestData,
    pricingVersionId?: string
  ): Promise<PricingResult> {
    const result: PricingResult = {
      success: true,
      finalPrice: breakdown.finalPrice,
      currency: 'GBP',
      pricing_version_id: pricingVersionId,
      breakdown: {
        baseFare: breakdown.baseFare,
        distanceFee: breakdown.distanceFee,
        timeFee: breakdown.timeFee,
        additionalFees: breakdown.airportFees + breakdown.zoneFees + breakdown.tollFees,
        services: breakdown.multiStopFees + breakdown.extraServices,
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
      const { legs } = await BookingTypeHandlers.generateReturnLegs(
        breakdown, 
        request, 
        breakdown.finalPrice
      );
      result.legs = legs;
    }

    // Generate legs breakdown for FLEET bookings
    if (request.bookingType === BookingType.FLEET && request.fleetConfig) {
      const { legs, summary } = await BookingTypeHandlers.generateFleetLegs(
        breakdown,
        request,
        breakdown.finalPrice
      );
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
      code: code,
      timestamp: new Date().toISOString()
    };
  }
}

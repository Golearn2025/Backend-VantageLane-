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
  NormalizedOneWayRequest
} from '../types/pricing.types';
import { PricingHelpers } from '../utils/PricingHelpers';
import { BookingTypeHandlers } from './BookingTypeHandlers';
import { FeeCalculators } from './FeeCalculators';
import { PricingDataService } from './PricingDataService';
import { handleOneWayPricing } from '../handlers/oneWayPricingHandler';

export class PricingEngine {

  /**
   * Main method to calculate pricing
   * 
   * MIGRATION STATUS:
   * - ONE_WAY: Uses new handleOneWayPricing() ✅
   * - RETURN: Legacy flow (TODO: migrate)
   * - HOURLY: Legacy flow (TODO: migrate)
   * - DAILY: Legacy flow (TODO: migrate)
   * - FLEET: Legacy flow (TODO: migrate)
   */
  public static async calculate(request: NormalizedPricingRequest): Promise<PricingResult> {
    try {
      // NEW FLOW: ONE_WAY uses dedicated handler
      if (request.bookingType === BookingType.ONE_WAY) {
        return await handleOneWayPricing({
          request: request as NormalizedOneWayRequest
        });
      }

      // LEGACY FLOW: Other booking types (temporary until migrated)
      // Convert NormalizedPricingRequest back to legacy PricingRequestData
      const legacyRequest = this.convertToLegacyRequest(request);

      // Validate request
      const validationError = this.validateRequest(legacyRequest);
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
        serviceItemFees: 0,
        subtotal: 0,
        multipliers: {},
        discounts: {
          total: 0,
          returnDiscount: undefined,
          fleetDiscount: undefined,
          corporateDiscount: undefined
        },
        finalPrice: 0,
        details: []
      };

      // Step 1: Base fare (NOT for hourly/daily bookings - those are flat rate)
      if (legacyRequest.bookingType !== BookingType.HOURLY && legacyRequest.bookingType !== BookingType.DAILY) {
        await FeeCalculators.calculateBaseFare(breakdown, legacyRequest);
        // Capture pricing_version_id from vehicle rates
        const rates = await PricingDataService.getVehicleRates(
          legacyRequest.vehicleType,
          legacyRequest.bookingType,
          legacyRequest.organizationId
        );
        pricingVersionId = rates.pricing_version_id;
      }

      // Step 2: Calculate main fare (distance/time vs hourly vs daily)
      if (legacyRequest.bookingType === BookingType.HOURLY) {
        await FeeCalculators.calculateHourlyFee(breakdown, legacyRequest);
        // Capture pricing_version_id from hourly rules
        const hourlyRules = await PricingDataService.getHourlyRules(
          legacyRequest.vehicleType,
          legacyRequest.organizationId
        );
        pricingVersionId = hourlyRules.pricing_version_id;
      } else if (legacyRequest.bookingType === BookingType.DAILY) {
        await FeeCalculators.calculateDailyFee(breakdown, legacyRequest);
        // Capture pricing_version_id from daily rules
        const dailyRules = await PricingDataService.getDailyRules(
          legacyRequest.vehicleType,
          legacyRequest.organizationId
        );
        pricingVersionId = dailyRules.pricing_version_id;
      } else {
        if (legacyRequest.distance != null) {
          await FeeCalculators.calculateDistanceFee(breakdown, legacyRequest);
        }
        if (legacyRequest.duration != null) {
          await FeeCalculators.calculateTimeFee(breakdown, legacyRequest);
        }
      }

      // Step 3: Zone fees (airports, congestion)
      await FeeCalculators.calculateZoneFees(breakdown, legacyRequest);

      // Step 4: Toll roads detection
      await FeeCalculators.calculateTollFees(breakdown, legacyRequest);

      // Step 5: Additional services
      await FeeCalculators.calculateAdditionalServices(breakdown, legacyRequest);

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
        breakdown.serviceItemFees;

      // Step 6: Apply booking type specific logic (RETURN or FLEET)
      if (legacyRequest.bookingType === BookingType.RETURN) {
        await BookingTypeHandlers.applyReturnTripLogic(breakdown, legacyRequest);
      } else if (legacyRequest.bookingType === BookingType.FLEET) {
        await BookingTypeHandlers.applyFleetLogic(breakdown, legacyRequest);
      }

      // Step 7: Apply time-based multipliers (only for non-hourly/daily bookings)
      if (legacyRequest.bookingType !== BookingType.HOURLY && legacyRequest.bookingType !== BookingType.DAILY) {
        await FeeCalculators.applyMultipliers(breakdown, legacyRequest);
      }

      // Step 8: Apply corporate discounts
      await FeeCalculators.applyDiscounts(breakdown, legacyRequest);

      // Step 9: Apply minimum fare
      await FeeCalculators.applyMinimumFare(breakdown, legacyRequest);

      // Step 10: Apply rounding policy
      const roundingRules = await PricingDataService.getRoundingRules();
      const priceBeforeRounding = breakdown.finalPrice || (breakdown.subtotal - breakdown.discounts.total);
      breakdown.finalPrice = PricingHelpers.applyRounding(
        priceBeforeRounding,
        {
          to: roundingRules.round_to_pence ? roundingRules.round_to_pence / 100 : 5,
          direction: roundingRules.direction || 'up'
        }
      );

      return this.createSuccessResponse(breakdown, legacyRequest, pricingVersionId);

    } catch (error: any) {
      console.error('Pricing calculation error:', error);
      return this.createErrorResponse(
        error.message || 'Internal pricing calculation error',
        500
      );
    }
  }

  /**
   * Convert NormalizedPricingRequest to legacy PricingRequestData
   * 
   * CRITICAL: Legacy FeeCalculators expect frontend-like TripPointInput objects,
   * not the normalized TripPoint format. We convert TripPoint → TripPointInput here.
   * 
   * TODO: Remove this when all booking types are migrated to new handlers
   */
  private static convertToLegacyRequest(request: NormalizedPricingRequest): PricingRequestData {
    // Helper: Convert TripPoint to TripPointInput
    const toTripPointInput = (tp: any | undefined): any | undefined => {
      if (!tp) return tp;
      // If already a simple object or string, return as-is
      if (typeof tp === 'string') return tp;
      // Convert TripPoint to TripPointInput format
      return {
        placeId: tp.placeId,
        address: tp.address,
        // Only include coordinates if both lat and lng are valid numbers
        coordinates:
          tp.coordinates &&
            tp.coordinates.lat != null &&
            tp.coordinates.lng != null
            ? [tp.coordinates.lat, tp.coordinates.lng]
            : undefined,
        type: tp.type
      };
    };

    // Base fields common to all types
    const base: any = {
      bookingType: request.bookingType,
      dateTime: request.dateTime,
      pickup: toTripPointInput(request.pickup),
      extras: request.extras,
      organizationId: request.organizationId
    };

    // Add type-specific fields
    switch (request.bookingType) {
      case BookingType.RETURN:
        return {
          ...base,
          vehicleType: request.vehicleType,
          dropoff: toTripPointInput(request.dropoff),
          additionalStops: request.additionalStops?.map(toTripPointInput) || [],
          returnDateTime: request.returnDateTime,
          returnPickup: toTripPointInput(request.returnPickup),
          returnDropoff: toTripPointInput(request.returnDropoff),
          returnAdditionalStops: request.returnAdditionalStops?.map(toTripPointInput) || [],
          distance: request.distance,
          duration: request.duration
        };
      case BookingType.HOURLY:
        return {
          ...base,
          vehicleType: request.vehicleType,
          dropoff: toTripPointInput(request.dropoff),
          hours: request.hours
        };
      case BookingType.DAILY:
        return {
          ...base,
          vehicleType: request.vehicleType,
          dropoff: toTripPointInput(request.dropoff),
          days: request.days
        };
      case BookingType.FLEET:
        return {
          ...base,
          dropoff: toTripPointInput(request.dropoff),
          additionalStops: request.additionalStops?.map(toTripPointInput) || [],
          fleetConfig: request.fleetConfig,
          distance: request.distance,
          duration: request.duration
        };
      default:
        return base as PricingRequestData;
    }
  }

  /**
   * Validate pricing request (legacy)
   * TODO: Remove when all types use new validators
   */
  private static validateRequest(request: PricingRequestData): string | null {
    if (!request.bookingType) {
      return 'Booking type is required';
    }

    if (!Object.values(BookingType).includes(request.bookingType)) {
      return `Invalid booking type: ${request.bookingType}`;
    }

    // Reject BESPOKE - not supported by pricing engine
    if (request.bookingType === BookingType.BESPOKE) {
      return 'BESPOKE bookings are not supported by pricing engine';
    }

    // Vehicle type required for non-FLEET bookings
    if (request.bookingType !== BookingType.FLEET) {
      if (!request.vehicleType) {
        return 'Vehicle type is required';
      }
      if (!Object.values(VehicleType).includes(request.vehicleType)) {
        return `Invalid vehicle type: ${request.vehicleType}`;
      }
    }

    // Type-specific validations
    if (request.bookingType === BookingType.HOURLY && request.hours == null) {
      return 'Hours are required for hourly bookings';
    }

    if (request.bookingType === BookingType.DAILY && request.days == null) {
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
      bookingBreakdown: breakdown,
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
      result.fleetSummary = summary;
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

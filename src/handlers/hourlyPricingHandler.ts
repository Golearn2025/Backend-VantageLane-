/**
 * HOURLY Pricing Handler
 * 
 * Handles pricing for hourly service bookings:
 * - 1 operational service leg
 * - Flat hourly rate (no distance/time fees)
 * - Minimum hours validation
 * - Service item fees (extras)
 * - Time-based multipliers
 * - Returns PricingResult with booking breakdown + 1 leg
 */

import {
  NormalizedHourlyRequest,
  PricingResult,
  LegBreakdown,
  PricingBreakdownData,
  BookingType,
  TripPoint,
  TripPointInput,
} from '../types/pricing.types';
import { validateOperationalLeg, OperationalLeg } from '../builders/legBuilder';
import { normalizeRoute } from '../normalizers/routeNormalizer';
import { FeeCalculators } from '../services/FeeCalculators';
import { PricingDataService } from '../services/PricingDataService';

/**
 * Convert TripPoint to TripPointInput for legacy FeeCalculators compatibility
 */
function toTripPointInput(point: TripPoint): TripPointInput {
  return {
    placeId: point.placeId,
    address: point.address,
    coordinates:
      point.coordinates &&
        point.coordinates.lat != null &&
        point.coordinates.lng != null
        ? [point.coordinates.lat, point.coordinates.lng]
        : undefined,
    type: point.type,
  };
}

export interface HourlyPricingContext {
  request: NormalizedHourlyRequest;
  pricingVersionId?: string;
}

/**
 * Main handler for HOURLY pricing
 * 
 * Flow:
 * 1. Validate hours (minimum check)
 * 2. Build 1 operational service leg
 * 3. Calculate hourly fee (flat rate × hours)
 * 4. Calculate service item fees (extras)
 * 5. Apply time multipliers
 * 6. Return PricingResult with booking breakdown + leg
 */
export async function handleHourlyPricing(
  context: HourlyPricingContext
): Promise<PricingResult> {
  const { request } = context;

  try {
    // 1. Validate hours
    if (!request.hours || request.hours < 1) {
      return {
        success: false,
        error: 'Invalid hours: minimum 1 hour required',
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Build operational leg (service leg, not route-based)
    // For HOURLY, pickup is required, dropoff is optional (chauffeur service)
    const dropoff = request.dropoff || request.pickup; // If no dropoff, use pickup

    // Create minimal route for HOURLY (service-based, not distance-based)
    const route = normalizeRoute(request.pickup, dropoff, []);

    const operationalLeg: OperationalLeg = {
      legNumber: 1,
      legKind: 'main',
      vehicleType: request.vehicleType,
      pickup: request.pickup,
      dropoff: dropoff,
      stops: [], // No additional stops for hourly service
      scheduledAt: request.dateTime,
      route,
    };

    const validation = validateOperationalLeg(operationalLeg);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid operational leg: ${validation.errors.join(', ')}`,
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Get pricing version ID
    const pricingVersionId = await PricingDataService.getCurrentPricingVersionId();

    // 4. Calculate leg pricing
    const legBreakdown = await calculateHourlyLegPricing(
      operationalLeg,
      request
    );

    // 5. Booking breakdown = leg breakdown (only 1 leg)
    const bookingBreakdown: PricingBreakdownData = {
      baseFare: legBreakdown.pricing.baseFare,
      distanceFee: 0, // Not applicable for hourly
      timeFee: 0, // Not applicable for hourly (flat hourly rate instead)
      airportFees: 0,
      zoneFees: 0,
      tollFees: 0,
      multiStopFees: 0,
      waitingFees: 0,
      serviceItemFees: legBreakdown.pricing.serviceItemFees,
      subtotal: legBreakdown.pricing.subtotal,
      multipliers: legBreakdown.pricing.multipliers,
      discounts: { total: 0 }, // No discounts for hourly
      finalPrice: legBreakdown.pricing.finalPrice,
      details: legBreakdown.pricing.details,
    };

    return {
      success: true,
      finalPrice: bookingBreakdown.finalPrice,
      currency: 'GBP',
      pricing_version_id: pricingVersionId,
      bookingBreakdown,
      legs: [legBreakdown],
      normalizedRoute: {
        bookingType: request.bookingType,
        dateTime: request.dateTime,
        pickup: request.pickup,
        dropoff: request.dropoff,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error in handleHourlyPricing:', error);
    return {
      success: false,
      error: error.message || 'Failed to calculate hourly pricing',
      code: 500,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Calculate pricing for hourly service leg
 */
async function calculateHourlyLegPricing(
  leg: OperationalLeg,
  request: NormalizedHourlyRequest
): Promise<LegBreakdown> {
  // Initialize breakdown
  const breakdown: PricingBreakdownData = {
    baseFare: 0, // Will be set by hourly fee calculation
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
    discounts: { total: 0 },
    finalPrice: 0,
    details: [],
  };

  // Convert to legacy format for FeeCalculators
  const legacyRequest = {
    bookingType: request.bookingType,
    vehicleType: request.vehicleType,
    dateTime: request.dateTime,
    hours: request.hours,
    pickup: toTripPointInput(leg.pickup),
    dropoff: leg.dropoff ? toTripPointInput(leg.dropoff) : undefined,
    additionalStops: [],
    extras: request.extras,
    organizationId: request.organizationId,
  };

  // Calculate hourly fee (flat rate × hours)
  // NOTE: FeeCalculators.calculateHourlyFee puts the amount in breakdown.timeFee
  await FeeCalculators.calculateHourlyFee(breakdown, legacyRequest);

  // For HOURLY, the hourly fee IS the base fare (no distance/time components)
  breakdown.baseFare = breakdown.timeFee;
  breakdown.timeFee = 0; // Reset timeFee since we moved it to baseFare

  // Calculate service item fees (extras)
  if (request.extras && request.extras.length > 0) {
    await FeeCalculators.calculateAdditionalServices(breakdown, legacyRequest);
  }

  await FeeCalculators.finalizeTransportThenServiceItems(breakdown, legacyRequest);

  // Map to LegBreakdown structure
  return {
    leg_number: 1,
    leg_kind: 'main',
    vehicle_category: request.vehicleType,
    pickup: leg.pickup,
    dropoff: leg.dropoff,
    stops: [],
    pricing: {
      baseFare: breakdown.baseFare,
      distanceFee: 0,
      timeFee: 0,
      multiStopFee: 0,
      waitingFees: 0,
      airportFees: 0,
      zoneFees: 0,
      tollFees: 0,
      serviceItemFees: breakdown.serviceItemFees,
      subtotal: breakdown.subtotal,
      multipliers: breakdown.multipliers,
      discount: 0,
      finalPrice: breakdown.finalPrice,
      details: breakdown.details,
    },
    platformFee: 0, // TODO: Calculate platform fee
    operatorNet: breakdown.finalPrice, // TODO: Calculate operator net
    driverPayout: 0, // TODO: Calculate driver payout
  };
}

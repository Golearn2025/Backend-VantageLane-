/**
 * DAILY Pricing Handler
 * 
 * Handles pricing for daily service bookings:
 * - 1 operational service leg
 * - Flat daily rate (no distance/time fees)
 * - Minimum 2 hours validation (business rule: cannot book under 2h)
 * - Service item fees (extras)
 * - Time-based multipliers
 * - Returns PricingResult with booking breakdown + 1 leg
 */

import {
  NormalizedDailyRequest,
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

export interface DailyPricingContext {
  request: NormalizedDailyRequest;
  pricingVersionId?: string;
}

/**
 * Main handler for DAILY pricing
 * 
 * Flow:
 * 1. Validate days (minimum 2 hours = 0.0833 days)
 * 2. Build 1 operational service leg
 * 3. Calculate daily fee (flat rate × days)
 * 4. Calculate service item fees (extras)
 * 5. Apply time multipliers
 * 6. Return PricingResult with booking breakdown + leg
 */
export async function handleDailyPricing(
  context: DailyPricingContext
): Promise<PricingResult> {
  const { request } = context;

  try {
    // 1. Validate days (minimum 1 full day, no fractional days)
    const MINIMUM_DAYS = 1;

    if (!request.days || request.days < MINIMUM_DAYS) {
      return {
        success: false,
        error: `Invalid days: minimum ${MINIMUM_DAYS} day required`,
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    // Validate whole days only (no fractional days like 1.5, 2.3)
    if (!Number.isInteger(request.days)) {
      return {
        success: false,
        error: 'Invalid days: only whole days allowed (1, 2, 3, etc.)',
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Build operational leg (service leg, not route-based)
    // For DAILY, pickup is required, dropoff is optional (chauffeur service)
    const dropoff = request.dropoff || request.pickup; // If no dropoff, use pickup

    // Create minimal route for DAILY (service-based, not distance-based)
    const route = normalizeRoute(request.pickup, dropoff, []);

    const operationalLeg: OperationalLeg = {
      legNumber: 1,
      legKind: 'main',
      vehicleType: request.vehicleType,
      pickup: request.pickup,
      dropoff: dropoff,
      stops: [], // No additional stops for daily service
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
    const legBreakdown = await calculateDailyLegPricing(
      operationalLeg,
      request
    );

    // 5. Booking breakdown = leg breakdown (only 1 leg)
    const bookingBreakdown: PricingBreakdownData = {
      baseFare: legBreakdown.pricing.baseFare,
      distanceFee: 0, // Not applicable for daily
      timeFee: 0, // Not applicable for daily (flat daily rate instead)
      airportFees: 0,
      zoneFees: 0,
      tollFees: 0,
      multiStopFees: 0,
      waitingFees: 0,
      serviceItemFees: legBreakdown.pricing.serviceItemFees,
      subtotal: legBreakdown.pricing.subtotal,
      multipliers: legBreakdown.pricing.multipliers,
      discounts: { total: 0 }, // No discounts for daily
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
    console.error('Error in handleDailyPricing:', error);
    return {
      success: false,
      error: error.message || 'Failed to calculate daily pricing',
      code: 500,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Calculate pricing for daily service leg
 */
async function calculateDailyLegPricing(
  leg: OperationalLeg,
  request: NormalizedDailyRequest
): Promise<LegBreakdown> {
  // Initialize breakdown
  const breakdown: PricingBreakdownData = {
    baseFare: 0, // Will be set by daily fee calculation
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
    days: request.days,
    pickup: toTripPointInput(leg.pickup),
    dropoff: leg.dropoff ? toTripPointInput(leg.dropoff) : undefined,
    additionalStops: [],
    extras: request.extras,
    organizationId: request.organizationId,
  };

  // Calculate daily fee (flat rate × days)
  // NOTE: FeeCalculators.calculateDailyFee puts the amount in breakdown.timeFee
  await FeeCalculators.calculateDailyFee(breakdown, legacyRequest);

  // For DAILY, the daily fee IS the base fare (no distance/time components)
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

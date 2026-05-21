/**
 * Return Pricing Handler
 * 
 * Handles pricing calculation for RETURN bookings (round-trip)
 * - 1 booking commercial
 * - 2 operational legs: outbound (main) + inbound (return)
 * - Separate route calculation per leg
 * - Booking-level discount allocation
 * - Returns complete PricingResult with 2 LegBreakdowns
 */

import {
  NormalizedReturnRequest,
  PricingResult,
  LegBreakdown,
  PricingBreakdownData,
  BookingType,
  TripPoint,
  TripPointInput,
} from '../types/pricing.types';
import { normalizeRoute, calculateRouteMetrics, RouteMetrics } from '../normalizers/routeNormalizer';
import { buildReturnLegs, validateOperationalLeg, OperationalLeg } from '../builders/legBuilder';
import { FeeCalculators } from '../services/FeeCalculators';
import { PricingDataService } from '../services/PricingDataService';

/**
 * Convert TripPoint to TripPointInput for legacy FeeCalculators compatibility
 */
function toTripPointInput(point: TripPoint): TripPointInput {
  return {
    placeId: point.placeId,
    address: point.address,
    coordinates: point.coordinates ? [point.coordinates.lat, point.coordinates.lng] : undefined,
    type: point.type,
  };
}

export interface ReturnPricingContext {
  request: NormalizedReturnRequest;
  pricingVersionId?: string;
}

/**
 * Main handler for RETURN pricing
 * 
 * Flow:
 * 1. Normalize outbound route (pickup → stops → dropoff)
 * 2. Normalize return route (returnPickup → returnStops → returnDropoff)
 * 3. Calculate metrics for each leg separately
 * 4. Build 2 operational legs (main + return)
 * 5. Calculate pricing per leg
 * 6. Aggregate to booking subtotal
 * 7. Apply return discount at booking level
 * 8. Allocate discount proportionally to legs
 * 9. Return PricingResult with bookingBreakdown + 2 legs
 */
export async function handleReturnPricing(
  context: ReturnPricingContext
): Promise<PricingResult> {
  const { request } = context;

  try {
    // 1. Normalize outbound route
    const outboundRoute = normalizeRoute(
      request.pickup,
      request.dropoff,
      request.additionalStops
    );

    // 2. Normalize return route (default: reverse of outbound if not provided)
    const returnRoute = normalizeRoute(
      request.returnPickup ?? request.dropoff,
      request.returnDropoff ?? request.pickup,
      request.returnAdditionalStops
    );

    // 3. Calculate route metrics for each leg independently via Google Maps.
    // We intentionally ignore the frontend-provided distance/duration hints for
    // return trips because the frontend only measures the outbound route and the
    // hint is frequently stale or incorrect, causing a large pricing discrepancy
    // between the two legs. Both legs must be priced on real route data.
    // Pass departure time so Google returns traffic-aware duration for each leg.
    const outboundMetrics = await calculateRouteMetrics(
      outboundRoute,
      undefined,
      undefined,
      request.dateTime ? new Date(request.dateTime) : undefined
    );

    const returnMetrics = await calculateRouteMetrics(
      returnRoute,
      undefined,
      undefined,
      request.returnDateTime ? new Date(request.returnDateTime) : undefined
    );

    // 4. Build operational legs
    const { outboundLeg, returnLeg } = buildReturnLegs(
      request,
      outboundRoute,
      returnRoute
    );

    // 5. Validate leg structures
    const outboundValidation = validateOperationalLeg(outboundLeg);
    if (!outboundValidation.valid) {
      return {
        success: false,
        error: `Invalid outbound leg: ${outboundValidation.errors.join(', ')}`,
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    const returnValidation = validateOperationalLeg(returnLeg);
    if (!returnValidation.valid) {
      return {
        success: false,
        error: `Invalid return leg: ${returnValidation.errors.join(', ')}`,
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    // 6. Calculate pricing for each leg
    const outboundLegBreakdown = await calculateLegPricing(
      outboundLeg,
      request,
      outboundMetrics,
      'outbound'
    );

    const returnLegBreakdown = await calculateLegPricing(
      returnLeg,
      request,
      returnMetrics,
      'return'
    );

    // 7. Aggregate booking-level breakdown
    const bookingBreakdown = aggregateBookingBreakdown(
      outboundLegBreakdown,
      returnLegBreakdown
    );

    // 8. Apply return discount at booking level
    const { discountAmount, discountedBreakdown } = await applyReturnDiscount(
      bookingBreakdown,
      request.vehicleType,
      request.organizationId
    );

    // 9. Allocate discount proportionally to legs
    const { outboundWithDiscount, returnWithDiscount } = allocateDiscountToLegs(
      outboundLegBreakdown,
      returnLegBreakdown,
      discountAmount
    );

    // 10. Get pricing version ID
    const pricingVersionId = context.pricingVersionId ||
      await PricingDataService.getCurrentPricingVersionId();

    // 11. Return complete result
    return {
      success: true,
      finalPrice: discountedBreakdown.finalPrice,
      currency: 'GBP',
      pricing_version_id: pricingVersionId,
      bookingBreakdown: discountedBreakdown,
      legs: [outboundWithDiscount, returnWithDiscount],
      normalizedRoute: {
        bookingType: BookingType.RETURN,
        dateTime: request.dateTime,
        returnDateTime: request.returnDateTime,
        pickup: outboundRoute.pickup,
        additionalStops: outboundRoute.stops,
        dropoff: outboundRoute.dropoff,
        returnPickup: returnRoute.pickup,
        returnAdditionalStops: returnRoute.stops,
        returnDropoff: returnRoute.dropoff,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown pricing error',
      code: 500,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Calculate pricing for a single leg (outbound or return)
 */
async function calculateLegPricing(
  leg: OperationalLeg,
  request: NormalizedReturnRequest,
  metrics: RouteMetrics,
  legType: 'outbound' | 'return'
): Promise<LegBreakdown> {
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
    discounts: { total: 0 },
    finalPrice: 0,
    details: [],
  };

  // Convert to legacy format for FeeCalculators
  // TripPoint -> TripPointInput conversion for coordinate compatibility
  const legacyRequest = {
    bookingType: request.bookingType,
    vehicleType: request.vehicleType,
    dateTime: legType === 'outbound' ? request.dateTime : request.returnDateTime,
    pickup: toTripPointInput(leg.pickup),
    dropoff: toTripPointInput(leg.dropoff),
    additionalStops: (leg.stops || []).map(toTripPointInput),
    distance: metrics.totalDistance,
    duration: metrics.totalDuration,
    extras: (request.extras || []).filter(e => e !== 'multi_stop'),
    organizationId: request.organizationId,
  };

  // Calculate base fare for this leg
  // Business rule: Each leg (outbound and return) calculates its own base fare independently
  // This ensures fair pricing based on each leg's specific characteristics
  await FeeCalculators.calculateBaseFare(breakdown, legacyRequest);

  // Calculate distance fee
  if (metrics.totalDistance != null) {
    await FeeCalculators.calculateDistanceFee(breakdown, legacyRequest);
  }

  // Calculate time fee
  if (metrics.totalDuration != null) {
    await FeeCalculators.calculateTimeFee(breakdown, legacyRequest);
  }

  // Calculate multi-stop fee
  if (leg.stops && leg.stops.length > 0) {
    await calculateMultiStopFee(
      breakdown,
      leg.stops.length,
      request.vehicleType,
      request.organizationId
    );
  }

  await FeeCalculators.calculateAdditionalServices(breakdown, legacyRequest);

  await FeeCalculators.finalizeTransportThenServiceItems(breakdown, legacyRequest);

  // Map to LegBreakdown.pricing structure (explicit mapping, not direct assignment)
  return {
    leg_number: legType === 'outbound' ? 1 : 2,
    leg_kind: legType === 'outbound' ? 'main' : 'return',
    vehicle_category: request.vehicleType,
    pickup: leg.pickup,
    dropoff: leg.dropoff,
    stops: leg.stops,
    pricing: {
      baseFare: breakdown.baseFare,
      distanceFee: breakdown.distanceFee,
      timeFee: breakdown.timeFee,
      multiStopFee: breakdown.multiStopFees, // Note: breakdown uses plural, type uses singular
      waitingFees: breakdown.waitingFees,
      airportFees: breakdown.airportFees,
      zoneFees: breakdown.zoneFees,
      tollFees: breakdown.tollFees,
      serviceItemFees: breakdown.serviceItemFees,
      subtotal: breakdown.subtotal,
      multipliers: breakdown.multipliers,
      discount: 0, // Allocated later at booking level
      finalPrice: breakdown.finalPrice,
      details: breakdown.details,
    },
    platformFee: 0, // TODO: Calculate platform fee
    operatorNet: breakdown.finalPrice, // TODO: Calculate operator net
    driverPayout: 0, // TODO: Calculate driver payout
  };
}

/**
 * Calculate multi-stop fee for a leg
 */
async function calculateMultiStopFee(
  breakdown: PricingBreakdownData,
  stopCount: number,
  vehicleType: string,
  organizationId?: string
): Promise<void> {
  if (stopCount === 0) return;

  const policy = await PricingDataService.getMultiStopPolicy(vehicleType, organizationId);
  const feePerStop = PricingDataService.penceToPounds(policy.fee_per_stop_pence);
  const totalFee = feePerStop * stopCount;

  breakdown.multiStopFees = totalFee;
  breakdown.details.push({
    component: 'multi_stop_fee',
    amount: totalFee,
    description: `${stopCount} additional stop${stopCount > 1 ? 's' : ''} at £${feePerStop.toFixed(2)} each`,
  });
}

/**
 * Aggregate booking-level breakdown from 2 legs
 */
function aggregateBookingBreakdown(
  outbound: LegBreakdown,
  returnLeg: LegBreakdown
): PricingBreakdownData {
  return {
    baseFare: outbound.pricing.baseFare + returnLeg.pricing.baseFare,
    distanceFee: outbound.pricing.distanceFee + returnLeg.pricing.distanceFee,
    timeFee: outbound.pricing.timeFee + returnLeg.pricing.timeFee,
    airportFees: outbound.pricing.airportFees + returnLeg.pricing.airportFees,
    zoneFees: outbound.pricing.zoneFees + returnLeg.pricing.zoneFees,
    tollFees: outbound.pricing.tollFees + returnLeg.pricing.tollFees,
    multiStopFees: outbound.pricing.multiStopFee + returnLeg.pricing.multiStopFee, // LegBreakdown uses singular
    waitingFees: outbound.pricing.waitingFees + returnLeg.pricing.waitingFees,
    serviceItemFees: outbound.pricing.serviceItemFees + returnLeg.pricing.serviceItemFees,
    subtotal: outbound.pricing.subtotal + returnLeg.pricing.subtotal,
    multipliers: {}, // TODO: Aggregate multipliers from both legs
    discounts: { total: 0 }, // Will be set by applyReturnDiscount
    finalPrice: outbound.pricing.subtotal + returnLeg.pricing.subtotal,
    details: [
      ...outbound.pricing.details.map(d => ({ ...d, description: `Outbound: ${d.description}` })),
      ...returnLeg.pricing.details.map(d => ({ ...d, description: `Return: ${d.description}` })),
    ],
  };
}

/**
 * Apply return discount at booking level
 * Return bookings typically get a discount (e.g., 10-20% off)
 */
async function applyReturnDiscount(
  breakdown: PricingBreakdownData,
  vehicleType: string,
  organizationId?: string
): Promise<{ discountAmount: number; discountedBreakdown: PricingBreakdownData }> {
  // Get return discount policy
  const discountPolicy = await PricingDataService.getReturnDiscountPolicy(
    vehicleType,
    organizationId
  );

  if (!discountPolicy || discountPolicy.discount_percentage === 0) {
    return {
      discountAmount: 0,
      discountedBreakdown: breakdown,
    };
  }

  const discountAmount = (breakdown.subtotal * discountPolicy.discount_percentage) / 100;

  return {
    discountAmount,
    discountedBreakdown: {
      ...breakdown,
      discounts: {
        total: discountAmount,
        returnDiscount: discountAmount,
      },
      finalPrice: breakdown.subtotal - discountAmount,
      details: [
        ...breakdown.details,
        {
          component: 'return_discount',
          amount: -discountAmount,
          description: `Return booking discount (${discountPolicy.discount_percentage}%)`,
        },
      ],
    },
  };
}

/**
 * Allocate booking-level discount proportionally to legs
 * This ensures each leg shows its share of the discount
 */
function allocateDiscountToLegs(
  outbound: LegBreakdown,
  returnLeg: LegBreakdown,
  totalDiscount: number
): { outboundWithDiscount: LegBreakdown; returnWithDiscount: LegBreakdown } {
  if (totalDiscount === 0) {
    return { outboundWithDiscount: outbound, returnWithDiscount: returnLeg };
  }

  const totalSubtotal = outbound.pricing.subtotal + returnLeg.pricing.subtotal;
  const outboundProportion = outbound.pricing.subtotal / totalSubtotal;
  const returnProportion = returnLeg.pricing.subtotal / totalSubtotal;

  const outboundDiscount = totalDiscount * outboundProportion;
  const returnDiscount = totalDiscount * returnProportion;

  return {
    outboundWithDiscount: {
      ...outbound,
      pricing: {
        ...outbound.pricing,
        discount: outboundDiscount,
        finalPrice: outbound.pricing.subtotal - outboundDiscount,
        details: [
          ...outbound.pricing.details,
          {
            component: 'allocated_discount',
            amount: -outboundDiscount,
            description: `Allocated return discount`,
          },
        ],
      },
    },
    returnWithDiscount: {
      ...returnLeg,
      pricing: {
        ...returnLeg.pricing,
        discount: returnDiscount,
        finalPrice: returnLeg.pricing.subtotal - returnDiscount,
        details: [
          ...returnLeg.pricing.details,
          {
            component: 'allocated_discount',
            amount: -returnDiscount,
            description: `Allocated return discount`,
          },
        ],
      },
    },
  };
}

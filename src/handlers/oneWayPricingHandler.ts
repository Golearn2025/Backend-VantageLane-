/**
 * One-Way Pricing Handler
 * 
 * Handles pricing calculation for ONE_WAY bookings with multi-stop support
 * - Builds operational leg from normalized request
 * - Calculates per-leg pricing breakdown
 * - Integrates with existing FeeCalculators
 * - Returns complete PricingResult with LegBreakdown
 */

import {
  NormalizedOneWayRequest,
  PricingResult,
  LegBreakdown,
  PricingBreakdownData,
  PricingDetail,
  BookingType,
} from '../types/pricing.types';
import { normalizeRoute, calculateRouteMetrics, RouteMetrics } from '../normalizers/routeNormalizer';
import { buildOneWayLeg, validateOperationalLeg, OperationalLeg } from '../builders/legBuilder';
import { FeeCalculators } from '../services/FeeCalculators';
import { PricingDataService } from '../services/PricingDataService';

export interface OneWayPricingContext {
  request: NormalizedOneWayRequest;
  pricingVersionId?: string;
}

/**
 * Main handler for ONE_WAY pricing
 */
export async function handleOneWayPricing(
  context: OneWayPricingContext
): Promise<PricingResult> {
  const { request } = context;

  try {
    // 1. Normalize route
    const route = normalizeRoute(request.pickup, request.dropoff, request.additionalStops);

    // 2. Calculate route metrics (computes real distance/duration if not provided)
    const metrics = await calculateRouteMetrics(route, request.distance, request.duration);

    // 3. Build operational leg
    const operationalLeg = buildOneWayLeg(request, route);

    // 4. Validate leg structure
    const validation = validateOperationalLeg(operationalLeg);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid operational leg: ${validation.errors.join(', ')}`,
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    // 5. Calculate pricing for the leg
    const legBreakdown = await calculateLegPricing(operationalLeg, request, metrics);

    // 6. Build booking-level breakdown (for ONE_WAY, same as leg breakdown)
    const bookingBreakdown: PricingBreakdownData = {
      baseFare: legBreakdown.pricing.baseFare,
      distanceFee: legBreakdown.pricing.distanceFee,
      timeFee: legBreakdown.pricing.timeFee,
      airportFees: legBreakdown.pricing.airportFees,
      zoneFees: legBreakdown.pricing.zoneFees,
      tollFees: legBreakdown.pricing.tollFees,
      multiStopFees: legBreakdown.pricing.multiStopFee,
      waitingFees: legBreakdown.pricing.waitingFees,
      serviceItemFees: legBreakdown.pricing.serviceItemFees,
      subtotal: legBreakdown.pricing.subtotal,
      multipliers: legBreakdown.pricing.multipliers,
      discounts: {
        total: legBreakdown.pricing.discount,
        corporateDiscount: legBreakdown.pricing.discount > 0 ? legBreakdown.pricing.discount : undefined,
      },
      finalPrice: legBreakdown.pricing.finalPrice,
      details: legBreakdown.pricing.details,
    };

    // 7. Get pricing version ID
    const activePricingVersion = await PricingDataService.getActivePricingVersion();
    const pricingVersionId = context.pricingVersionId || activePricingVersion?.id;

    // 8. Return complete pricing result
    return {
      success: true,
      finalPrice: bookingBreakdown.finalPrice,
      currency: 'GBP',
      pricing_version_id: pricingVersionId,
      bookingBreakdown,
      legs: [legBreakdown],
      normalizedRoute: {
        bookingType: BookingType.ONE_WAY,
        dateTime: request.dateTime,
        pickup: route.pickup,
        additionalStops: route.stops,
        dropoff: route.dropoff,
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
 * Calculate pricing for a single operational leg
 */
async function calculateLegPricing(
  leg: OperationalLeg,
  request: NormalizedOneWayRequest,
  metrics: RouteMetrics
): Promise<LegBreakdown> {
  // Initialize breakdown structure matching PricingBreakdownData exactly
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
      corporateDiscount: undefined,
    },
    finalPrice: 0,
    details: [],
  };

  // Convert normalized request to legacy PricingRequestData format for FeeCalculators
  // CRITICAL: Remove 'multi_stop' from extras to prevent duplication with our new multiStopFee calculation
  const legacyRequest = {
    bookingType: request.bookingType,
    vehicleType: request.vehicleType,
    dateTime: request.dateTime,
    pickup: request.pickup,
    dropoff: request.dropoff,
    additionalStops: request.additionalStops,
    distance: metrics.totalDistance,
    duration: metrics.totalDuration,
    extras: request.extras.filter(e => e !== 'multi_stop'), // Prevent duplication
    organizationId: request.organizationId,
  };

  // Calculate base fare
  await FeeCalculators.calculateBaseFare(breakdown, legacyRequest);

  // Calculate distance fee (if distance available)
  if (metrics.totalDistance != null) {
    await FeeCalculators.calculateDistanceFee(breakdown, legacyRequest);
  }

  // Calculate time fee (if duration available)
  if (metrics.totalDuration != null) {
    await FeeCalculators.calculateTimeFee(breakdown, legacyRequest);
  }

  // Calculate multi-stop fee (NEW: based on additionalStops.length, not extras)
  // NOTE: This replaces the old multi_stop extras flag - ensure no duplication in FeeCalculators
  if (request.additionalStops.length > 0) {
    await calculateMultiStopFee(breakdown, request.additionalStops.length, request.vehicleType, request.organizationId);
  }

  // Calculate additional services (airport fees, zone fees, toll fees, service items)
  // NOTE: This populates airportFees, zoneFees, tollFees, serviceItemFees
  await FeeCalculators.calculateAdditionalServices(breakdown, legacyRequest);

  // Calculate subtotal
  breakdown.subtotal =
    breakdown.baseFare +
    breakdown.distanceFee +
    breakdown.timeFee +
    breakdown.multiStopFees +
    breakdown.airportFees +
    breakdown.zoneFees +
    breakdown.tollFees +
    breakdown.serviceItemFees +
    breakdown.waitingFees;

  // Apply multipliers (time-based, demand, etc.)
  // CRITICAL: applyMultipliers modifies breakdown.subtotal directly by adding multiplier amount
  await FeeCalculators.applyMultipliers(breakdown, legacyRequest);

  // Apply discounts (corporate, etc.)
  // CRITICAL: applyDiscounts modifies breakdown.discounts.total and adds corporateDiscount
  await FeeCalculators.applyDiscounts(breakdown, legacyRequest);

  // Calculate final price (subtotal already includes multipliers)
  breakdown.finalPrice = breakdown.subtotal - breakdown.discounts.total;

  // Build LegBreakdown
  const legBreakdown: LegBreakdown = {
    leg_number: leg.legNumber,
    leg_kind: leg.legKind,
    vehicle_category: leg.vehicleType,
    pickup: leg.pickup,
    dropoff: leg.dropoff,
    stops: leg.stops,
    pricing: {
      baseFare: breakdown.baseFare,
      distanceFee: breakdown.distanceFee,
      timeFee: breakdown.timeFee,
      multiStopFee: breakdown.multiStopFees,
      waitingFees: breakdown.waitingFees,
      airportFees: breakdown.airportFees,
      zoneFees: breakdown.zoneFees,
      tollFees: breakdown.tollFees,
      serviceItemFees: breakdown.serviceItemFees,
      subtotal: breakdown.subtotal,
      multipliers: breakdown.multipliers,
      discount: breakdown.discounts.total,
      finalPrice: breakdown.finalPrice,
      details: breakdown.details,
    },
    // TODO CRITICAL: These are placeholders - implement before production
    platformFee: 0, // TODO: Calculate platform fee based on business rules
    operatorNet: breakdown.finalPrice, // TODO: Calculate operator net (finalPrice - platformFee - driverPayout)
    driverPayout: 0, // TODO: Calculate driver payout based on driver contract
  };

  return legBreakdown;
}

/**
 * Calculate multi-stop fee
 * Uses pricing rules from database via service policies
 */
async function calculateMultiStopFee(
  breakdown: PricingBreakdownData,
  stopCount: number,
  vehicleType: string,
  organizationId?: string
): Promise<void> {
  try {
    // Get service policies which include multi-stop fee
    const policies = await PricingDataService.getServicePolicies();

    if (!policies.multiStop || policies.multiStop === 0) {
      return;
    }

    // Calculate fee based on stop count
    const feePerStop = policies.multiStop;
    const multiStopFee = stopCount * feePerStop;

    breakdown.multiStopFees = multiStopFee;

    breakdown.details.push({
      component: 'multi_stop_fee',
      amount: multiStopFee,
      description: `${stopCount} additional stop${stopCount > 1 ? 's' : ''} at £${feePerStop.toFixed(2)} each`,
    });
  } catch (error) {
    // If service policies not found, skip (no fee)
    console.warn('Service policies not found, skipping multi-stop fee');
  }
}

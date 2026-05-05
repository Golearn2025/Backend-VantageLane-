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
  RouteMetrics as RouteMetricsType,
  DualQuotePricingLogic,
  PricingRequestData,
} from '../types/pricing.types';
import { normalizeRoute, calculateRouteMetrics, RouteMetrics, NormalizedRoute } from '../normalizers/routeNormalizer';
import { buildOneWayLeg, validateOperationalLeg, OperationalLeg } from '../builders/legBuilder';
import { FeeCalculators } from '../services/FeeCalculators';
import { PricingDataService } from '../services/PricingDataService';
import { RouteCalculationService } from '../services/RouteCalculationService';

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
    console.log('🔵 handleOneWayPricing CALLED - checking dual quote logic...');

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

    // 5. Check if dual quote stop logic is enabled and applicable
    console.log('🔍 Checking dual quote feature flag...');
    const isDualQuoteEnabled = await PricingDataService.isDualQuoteStopLogicEnabled();
    const hasStops = request.additionalStops && request.additionalStops.length > 0;
    console.log(`🎯 isDualQuoteEnabled: ${isDualQuoteEnabled}, hasStops: ${hasStops}`);

    let bookingBreakdown: PricingBreakdownData;
    let routeMetrics: RouteMetricsType | undefined;
    let dualQuotePricing: DualQuotePricingLogic | undefined;
    let legBreakdown: LegBreakdown;

    if (isDualQuoteEnabled && hasStops) {
      // 🆕 NEW: Use dual quote stop pricing logic
      console.log('✅ Using dual quote stop pricing logic');
      const dualQuoteResult = await calculateDualQuoteStopPricing(request, route, metrics);

      bookingBreakdown = dualQuoteResult.finalBreakdown;
      routeMetrics = dualQuoteResult.routeMetrics;
      dualQuotePricing = dualQuoteResult.dualQuotePricing;

      // Build leg breakdown from final breakdown
      legBreakdown = {
        leg_number: 1,
        leg_kind: 'main',
        pickup: request.pickup,
        dropoff: request.dropoff,
        scheduled_at: request.dateTime,
        distance_miles: metrics.totalDistance,
        duration_min: metrics.totalDuration,
        stops: request.additionalStops,
        pricing: {
          baseFare: bookingBreakdown.baseFare,
          distanceFee: bookingBreakdown.distanceFee,
          timeFee: bookingBreakdown.timeFee,
          multiStopFee: bookingBreakdown.multiStopFees,
          waitingFees: bookingBreakdown.waitingFees,
          airportFees: bookingBreakdown.airportFees,
          zoneFees: bookingBreakdown.zoneFees,
          tollFees: bookingBreakdown.tollFees,
          serviceItemFees: bookingBreakdown.serviceItemFees,
          subtotal: bookingBreakdown.subtotal,
          multipliers: bookingBreakdown.multipliers,
          discount: bookingBreakdown.discounts.total,
          finalPrice: bookingBreakdown.finalPrice,
          details: bookingBreakdown.details,
        },
        platformFee: 0,
        operatorNet: bookingBreakdown.finalPrice,
        driverPayout: 0,
      };
    } else {
      // ⚙️ LEGACY: Use traditional flat fee pricing
      if (!isDualQuoteEnabled && hasStops) {
        console.log('ℹ️ Using legacy flat fee multi-stop pricing');
      }

      legBreakdown = await calculateLegPricing(operationalLeg, request, metrics);

      // Build booking-level breakdown (for ONE_WAY, same as leg breakdown)
      bookingBreakdown = {
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

      // Populate routeMetrics from calculated metrics (for financial snapshot)
      routeMetrics = {
        fullDistance: metrics.totalDistance,
        fullDuration: metrics.totalDuration,
      };
    }

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
      // 🆕 NEW: Include dual quote pricing data if available
      routeMetrics,
      dualQuotePricing,
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
 * @param skipMultiStopFee - If true, skip multi-stop fee calculation (for direct quote)
 */
async function calculateLegPricing(
  leg: OperationalLeg,
  request: NormalizedOneWayRequest,
  metrics: RouteMetrics,
  skipMultiStopFee: boolean = false
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
  } as unknown as PricingRequestData;

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
  // Multi-stop fee applies when there are intermediate stops between pickup and dropoff
  // Can be skipped for dual quote direct route calculation
  if (!skipMultiStopFee && request.additionalStops && request.additionalStops.length > 0) {
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

  // Apply minimum fare: if finalPrice < minimum_fare_pence → bump up to minimum
  await FeeCalculators.applyMinimumFareToFinal(breakdown, legacyRequest);

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
 * 🆕 NEW: Dual quote stop pricing with grace threshold
 * 
 * Strategy:
 * 1. Calculate direct route (pickup → dropoff, no stops)
 * 2. Calculate full route (pickup → stops → dropoff)
 * 3. Calculate detour (full - direct)
 * 4. Calculate direct quote (no multi-stop fee)
 * 5. Calculate full quote (with multi-stop fee)
 * 6. Apply grace threshold:
 *    - If detour < threshold → use direct quote
 *    - If detour >= threshold → use full quote
 * 7. Return final quote with metadata
 */
async function calculateDualQuoteStopPricing(
  request: NormalizedOneWayRequest,
  route: NormalizedRoute,
  fullMetrics: RouteMetrics
): Promise<{
  routeMetrics: RouteMetricsType;
  dualQuotePricing: DualQuotePricingLogic;
  finalBreakdown: PricingBreakdownData;
}> {
  // 1. Calculate direct route metrics (no stops)
  const directMetrics = await RouteCalculationService.calculateDirectRoute(
    request.pickup,
    request.dropoff
  );

  // 2. Calculate detour
  // Convert RouteMetrics to RouteMetricsResult for comparison
  const fullMetricsResult = {
    totalDistance: fullMetrics.totalDistance || 0,
    totalDuration: fullMetrics.totalDuration || 0,
    segments: [],
    source: 'google_maps' as const
  };
  const detour = RouteCalculationService.calculateDetourMetrics(
    directMetrics,
    fullMetricsResult
  );

  // 3. Get grace threshold config
  const graceThreshold = await PricingDataService.getStopGraceThreshold();

  // 4. Build operational leg for direct route (no stops)
  const directRoute: NormalizedRoute = {
    ...route,
    stops: [],
    totalStops: 0,
    segments: route.segments.filter(seg =>
      seg.from.type === 'pickup' && seg.to.type === 'dropoff'
    )
  };
  const directLeg = buildOneWayLeg(request, directRoute);

  // 5. Calculate direct quote (no multi-stop fee)
  // Convert RouteMetricsResult to RouteMetrics format expected by calculateLegPricing
  const directMetricsForPricing: RouteMetrics = {
    totalDistance: directMetrics.totalDistance,
    totalDuration: directMetrics.totalDuration,
    segmentCount: 1,
    metricsSource: 'computed'  // Direct route metrics are computed
  };
  const directBreakdown = await calculateLegPricing(
    directLeg,
    { ...request, additionalStops: [] },  // No stops
    directMetricsForPricing,
    true  // skipMultiStopFee = true
  );

  // 6. Build operational leg for full route (with stops)
  const fullLeg = buildOneWayLeg(request, route);

  // 7. Calculate full quote (with multi-stop fee)
  const fullBreakdown = await calculateLegPricing(
    fullLeg,
    request,
    fullMetrics,
    false  // skipMultiStopFee = false (calculate multi-stop fee)
  );

  // 8. Apply grace threshold logic
  const detourExceedsThreshold =
    detour.detourDistance > graceThreshold.miles ||
    detour.detourDuration > graceThreshold.minutes;

  const stopGraceApplied = !detourExceedsThreshold;

  // Select final breakdown based on grace threshold decision
  const selectedBreakdown = stopGraceApplied ? directBreakdown : fullBreakdown;
  const finalBreakdown: PricingBreakdownData = {
    baseFare: selectedBreakdown.pricing.baseFare,
    distanceFee: selectedBreakdown.pricing.distanceFee,
    timeFee: selectedBreakdown.pricing.timeFee,
    airportFees: selectedBreakdown.pricing.airportFees,
    zoneFees: selectedBreakdown.pricing.zoneFees,
    tollFees: selectedBreakdown.pricing.tollFees,
    multiStopFees: selectedBreakdown.pricing.multiStopFee,
    waitingFees: selectedBreakdown.pricing.waitingFees,
    serviceItemFees: selectedBreakdown.pricing.serviceItemFees,
    subtotal: selectedBreakdown.pricing.subtotal,
    multipliers: selectedBreakdown.pricing.multipliers,
    discounts: {
      total: selectedBreakdown.pricing.discount,
      corporateDiscount: selectedBreakdown.pricing.discount > 0 ? selectedBreakdown.pricing.discount : undefined,
    },
    finalPrice: selectedBreakdown.pricing.finalPrice,
    details: selectedBreakdown.pricing.details,
  };

  // 9. Build result
  return {
    routeMetrics: {
      directDistance: directMetrics.totalDistance,
      directDuration: directMetrics.totalDuration,
      fullDistance: fullMetrics.totalDistance,
      fullDuration: fullMetrics.totalDuration,
      detourDistance: detour.detourDistance,
      detourDuration: detour.detourDuration
    },
    dualQuotePricing: {
      directQuotePence: Math.round(directBreakdown.pricing.finalPrice * 100),
      fullQuotePence: Math.round(fullBreakdown.pricing.finalPrice * 100),
      finalQuotePence: Math.round(finalBreakdown.finalPrice * 100),
      stopGraceApplied,
      graceThresholdMiles: graceThreshold.miles,
      graceThresholdMinutes: graceThreshold.minutes,
      pricingStrategy: stopGraceApplied ? 'direct' : 'full'
    },
    finalBreakdown
  };
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

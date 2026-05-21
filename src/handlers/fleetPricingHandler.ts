/**
 * FLEET Pricing Handler
 * 
 * Handles pricing for fleet bookings with multiple vehicles:
 * - N operational legs (1 per vehicle)
 * - Supports 3 base service types:
 *   * FLEET + ONE_WAY: route-based pricing per vehicle
 *   * FLEET + HOURLY: hourly rate pricing per vehicle
 *   * FLEET + DAILY: daily rate pricing per vehicle
 * - Fleet-level discounts
 * - Per-vehicle pricing breakdown
 * - Returns PricingResult with booking breakdown + N legs
 */

import {
  NormalizedFleetRequest,
  PricingResult,
  LegBreakdown,
  PricingBreakdownData,
  BookingType,
  VehicleType,
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

/**
 * Get fleet discount percentage based on total vehicle count
 * Reads from: pricing_fleet_discounts
 * Returns highest applicable discount (e.g., 5% for 3+ vehicles, 10% for 5+ vehicles)
 */
async function getFleetDiscount(
  totalVehicles: number,
  organizationId?: string
): Promise<number> {
  try {
    const discounts = await PricingDataService.getFleetDiscounts(organizationId);

    // Find highest applicable discount based on min_vehicles threshold
    let applicableDiscount = 0;
    for (const discount of discounts) {
      if (totalVehicles >= discount.min_vehicles && discount.discount_percent > applicableDiscount) {
        applicableDiscount = discount.discount_percent;
      }
    }

    return applicableDiscount;
  } catch (error) {
    console.error('Error fetching fleet discount:', error);
    return 0; // No discount on error
  }
}

export interface FleetPricingContext {
  request: NormalizedFleetRequest;
  pricingVersionId?: string;
}

/**
 * Main handler for FLEET pricing
 * 
 * Flow:
 * 1. Validate fleet config (vehicle types and counts)
 * 2. Build N operational legs (1 per vehicle)
 * 3. Calculate pricing per vehicle based on baseServiceType:
 *    - ONE_WAY: distance/time fees
 *    - HOURLY: hourly rate
 *    - DAILY: daily rate
 * 4. Apply fleet-level discounts
 * 5. Aggregate to booking breakdown
 * 6. Return PricingResult with booking breakdown + N legs
 */
export async function handleFleetPricing(
  context: FleetPricingContext
): Promise<PricingResult> {
  const { request } = context;

  try {
    // 1. Validate fleet config
    if (!request.fleetConfig || Object.keys(request.fleetConfig).length === 0) {
      return {
        success: false,
        error: 'Fleet configuration is required',
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Get pricing version ID
    const pricingVersionId = await PricingDataService.getCurrentPricingVersionId();

    // 3. Build operational legs (1 per vehicle)
    const legs: LegBreakdown[] = [];
    let vehicleIndex = 1;

    for (const [vehicleType, count] of Object.entries(request.fleetConfig)) {
      if (!count || count < 1) continue;

      // Create legs for each vehicle of this type
      for (let i = 0; i < count; i++) {
        const vehicleModelId = request.fleetVehicles?.[vehicleIndex - 1]?.model ?? undefined;
        const legBreakdown = await calculateFleetVehicleLegPricing(
          vehicleIndex,
          vehicleType as VehicleType,
          request,
          vehicleModelId
        );
        legs.push(legBreakdown);
        vehicleIndex++;
      }
    }

    if (legs.length === 0) {
      return {
        success: false,
        error: 'No valid vehicles in fleet configuration',
        code: 400,
        timestamp: new Date().toISOString(),
      };
    }

    // 4. Aggregate booking breakdown from all legs
    const bookingBreakdown: PricingBreakdownData = {
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

    // Sum up all leg pricing
    for (const leg of legs) {
      bookingBreakdown.baseFare += leg.pricing.baseFare;
      bookingBreakdown.distanceFee += leg.pricing.distanceFee;
      bookingBreakdown.timeFee += leg.pricing.timeFee;
      bookingBreakdown.multiStopFees += leg.pricing.multiStopFee;
      bookingBreakdown.waitingFees += leg.pricing.waitingFees;
      bookingBreakdown.airportFees += leg.pricing.airportFees;
      bookingBreakdown.zoneFees += leg.pricing.zoneFees;
      bookingBreakdown.tollFees += leg.pricing.tollFees;
      bookingBreakdown.serviceItemFees += leg.pricing.serviceItemFees;
      bookingBreakdown.subtotal += leg.pricing.subtotal;
      bookingBreakdown.discounts.total += leg.pricing.discount;
      bookingBreakdown.finalPrice += leg.pricing.finalPrice;

      // Merge multipliers (take max if same period)
      for (const [period, multiplier] of Object.entries(leg.pricing.multipliers)) {
        if (!bookingBreakdown.multipliers[period] || multiplier > bookingBreakdown.multipliers[period]) {
          bookingBreakdown.multipliers[period] = multiplier;
        }
      }
    }

    // 5. Apply fleet-level discount based on total vehicle count
    const totalVehicles = legs.length;
    const fleetDiscountPercent = await getFleetDiscount(totalVehicles, request.organizationId);

    if (fleetDiscountPercent > 0) {
      const fleetDiscountRate = fleetDiscountPercent / 100; // Convert to decimal
      const totalDiscountAmount = bookingBreakdown.subtotal * fleetDiscountRate;

      // Allocate discount proportionally to each leg based on its subtotal
      for (const leg of legs) {
        const legProportion = leg.pricing.subtotal / bookingBreakdown.subtotal;
        const legDiscountAmount = totalDiscountAmount * legProportion;

        // Update leg pricing with allocated discount
        leg.pricing.discount = legDiscountAmount;
        leg.pricing.finalPrice = leg.pricing.subtotal - legDiscountAmount;
      }

      // Update booking breakdown
      bookingBreakdown.discounts.total = totalDiscountAmount;
      bookingBreakdown.discounts.fleetDiscount = fleetDiscountRate;
      bookingBreakdown.finalPrice = bookingBreakdown.subtotal - totalDiscountAmount;

      bookingBreakdown.details.push({
        component: 'fleet_discount',
        amount: -totalDiscountAmount,
        description: `Fleet discount ${fleetDiscountPercent}% (${totalVehicles} vehicles)`,
      });
    }

    // 6. Build fleet summary per vehicle category
    const summaryMap: Record<string, { count: number; unitPrice: number; totalPrice: number }> = {};
    for (const leg of legs) {
      const category = leg.vehicle_category || 'unknown';
      if (!summaryMap[category]) {
        summaryMap[category] = {
          count: 0,
          unitPrice: leg.pricing.finalPrice, // Price per vehicle after discount
          totalPrice: 0
        };
      }
      summaryMap[category].count++;
      summaryMap[category].totalPrice += leg.pricing.finalPrice;
    }

    // Convert to array format matching FleetCategorySummary[]
    const fleetSummary = Object.entries(summaryMap).map(([category, data]) => ({
      category: category as VehicleType,
      count: data.count,
      unit_price: data.unitPrice,
      total: data.totalPrice
    }));

    return {
      success: true,
      finalPrice: bookingBreakdown.finalPrice,
      currency: 'GBP',
      pricing_version_id: pricingVersionId,
      bookingBreakdown,
      legs,
      fleetSummary, // Summary per vehicle category (array format)
      normalizedRoute: {
        bookingType: request.bookingType,
        dateTime: request.dateTime,
        pickup: request.pickup,
        dropoff: request.dropoff,
        additionalStops: request.additionalStops || [],
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error in handleFleetPricing:', error);
    return {
      success: false,
      error: error.message || 'Failed to calculate fleet pricing',
      code: 500,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Calculate pricing for a single fleet vehicle leg
 * Based on baseServiceType: ONE_WAY, HOURLY, or DAILY
 */
async function calculateFleetVehicleLegPricing(
  vehicleIndex: number,
  vehicleType: VehicleType,
  request: NormalizedFleetRequest,
  vehicleModelId?: string
): Promise<LegBreakdown> {
  // For FLEET + HOURLY/DAILY, dropoff is optional (chauffeur may stay at pickup)
  // For FLEET + ONE_WAY, dropoff is required
  const dropoff = request.dropoff || request.pickup;

  // Build operational leg
  const route = normalizeRoute(request.pickup, dropoff, request.additionalStops);

  const operationalLeg: OperationalLeg = {
    legNumber: vehicleIndex,
    legKind: 'fleet_item',
    vehicleType: vehicleType,
    vehicleUnitIndex: vehicleIndex,
    pickup: request.pickup,
    dropoff: dropoff,
    stops: request.additionalStops,
    scheduledAt: request.dateTime,
    route,
  };

  const validation = validateOperationalLeg(operationalLeg);
  if (!validation.valid) {
    throw new Error(`Invalid operational leg ${vehicleIndex}: ${validation.errors.join(', ')}`);
  }

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
    discounts: { total: 0 },
    finalPrice: 0,
    details: [],
  };

  // Calculate pricing based on baseServiceType (vehicle_rates: fleet / fleet_hourly / fleet_daily)
  if (request.baseServiceType === BookingType.ONE_WAY) {
    // FLEET + ONE_WAY: route-based pricing (shared route for all vehicles)
    const legacyRequest = {
      bookingType: BookingType.FLEET,
      vehicleType: vehicleType,
      dateTime: request.dateTime,
      pickup: toTripPointInput(operationalLeg.pickup),
      dropoff: toTripPointInput(operationalLeg.dropoff),
      additionalStops: (request.additionalStops || []).map(toTripPointInput),
      extras: request.extras || [], // Extras WITHOUT multi_stop (handled separately)
      organizationId: request.organizationId,
      distance: request.distance,
      duration: request.duration,
    };

    // Base fare
    await FeeCalculators.calculateBaseFare(breakdown, legacyRequest);

    // Distance fee (if distance provided)
    if (request.distance != null) {
      await FeeCalculators.calculateDistanceFee(breakdown, legacyRequest);
    }

    // Time fee (if duration provided)
    if (request.duration != null) {
      await FeeCalculators.calculateTimeFee(breakdown, legacyRequest);
    }

    // Multi-stop fees (separate from extras to avoid duplication)
    if (request.additionalStops && request.additionalStops.length > 0) {
      const multiStopRequest = {
        ...legacyRequest,
        extras: ['multi_stop'], // ONLY multi_stop, not general extras
      };
      await FeeCalculators.calculateAdditionalServices(breakdown, multiStopRequest);
    }

    // Service item fees (general extras, NOT multi_stop)
    const generalExtras = (request.extras || []).filter(e => e !== 'multi_stop');
    if (generalExtras.length > 0) {
      const extrasRequest = {
        ...legacyRequest,
        extras: generalExtras,
      };
      await FeeCalculators.calculateAdditionalServices(breakdown, extrasRequest);
    }

    await FeeCalculators.finalizeTransportThenServiceItems(breakdown, legacyRequest);

  } else if (request.baseServiceType === BookingType.HOURLY) {
    // FLEET + HOURLY: flat hourly rate per vehicle
    if (!request.hours || request.hours < 1) {
      throw new Error('FLEET + HOURLY requires explicit hours field (minimum 1 hour)');
    }

    const hourlyRequest = {
      bookingType: BookingType.FLEET_HOURLY,
      vehicleType: vehicleType,
      dateTime: request.dateTime,
      hours: request.hours, // Explicit hours from request
      pickup: toTripPointInput(operationalLeg.pickup),
      dropoff: toTripPointInput(operationalLeg.dropoff),
      additionalStops: [],
      extras: request.extras,
      organizationId: request.organizationId,
    };

    // NOTE: FeeCalculators.calculateHourlyFee puts amount in breakdown.timeFee
    await FeeCalculators.calculateHourlyFee(breakdown, hourlyRequest);

    // Move timeFee to baseFare for consistency
    breakdown.baseFare = breakdown.timeFee;
    breakdown.timeFee = 0;

    // Service item fees (extras)
    if (request.extras && request.extras.length > 0) {
      await FeeCalculators.calculateAdditionalServices(breakdown, hourlyRequest);
    }

    await FeeCalculators.finalizeTransportThenServiceItems(breakdown, hourlyRequest);

  } else if (request.baseServiceType === BookingType.DAILY) {
    // FLEET + DAILY: flat daily rate per vehicle
    if (!request.days || request.days < 1) {
      throw new Error('FLEET + DAILY requires explicit days field (minimum 1 day)');
    }

    const dailyRequest = {
      bookingType: BookingType.FLEET_DAILY,
      vehicleType: vehicleType,
      dateTime: request.dateTime,
      days: request.days, // Explicit days from request
      pickup: toTripPointInput(operationalLeg.pickup),
      dropoff: toTripPointInput(operationalLeg.dropoff),
      additionalStops: [],
      extras: request.extras,
      organizationId: request.organizationId,
    };

    // NOTE: FeeCalculators.calculateDailyFee puts amount in breakdown.timeFee
    await FeeCalculators.calculateDailyFee(breakdown, dailyRequest);

    // Move timeFee to baseFare for consistency
    breakdown.baseFare = breakdown.timeFee;
    breakdown.timeFee = 0;

    // Service item fees (extras)
    if (request.extras && request.extras.length > 0) {
      await FeeCalculators.calculateAdditionalServices(breakdown, dailyRequest);
    }

    await FeeCalculators.finalizeTransportThenServiceItems(breakdown, dailyRequest);
  } else {
    throw new Error(`Unsupported fleet baseServiceType: ${request.baseServiceType}`);
  }

  // Map to LegBreakdown structure
  return {
    leg_number: vehicleIndex,
    leg_kind: 'fleet_item',
    vehicle_category: vehicleType,
    vehicle_model_id: vehicleModelId,
    pickup: operationalLeg.pickup,
    dropoff: operationalLeg.dropoff,
    stops: operationalLeg.stops,
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
      discount: 0, // No per-vehicle discount
      finalPrice: breakdown.finalPrice,
      details: breakdown.details,
    },
    platformFee: 0, // TODO: Calculate platform fee
    operatorNet: breakdown.finalPrice, // TODO: Calculate operator net
    driverPayout: 0, // TODO: Calculate driver payout
  };
}

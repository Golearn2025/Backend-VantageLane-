/**
 * Quote Line Items Builder
 * 
 * Builds standardized line_items JSONB structure for quotes
 * Eliminates duplication between independent/booking/leg quotes
 */

import {
  PricingResult,
  LegBreakdown,
  PricingBreakdownData,
  NormalizedPricingRequest,
  BookingType,
  RouteMetrics,
  DualQuotePricingLogic
} from '../../types/pricing.types';

export interface LineItemComponent {
  code: string;
  label: string;
  amount_pence: number;
}

export interface LineItemDiscount {
  code: string;
  label: string;
  amount_pence: number;
}

export interface LineItemMultiplier {
  code: string;
  label: string;
  factor: number;
}

export interface LineItemSummary {
  subtotal_pence: number;
  discount_pence: number;
  vat_pence: number;
  total_pence: number;
}

export interface LineItemMeta {
  calc_source: string;
  calc_version: string;
  snapshot_format?: 'booking_only_v1' | 'booking_and_legs_v1';
  trip?: {
    bookingType: string;
    vehicleType?: string;
    dateTime: string;
    pickup: any;
    dropoff?: any;
    additionalStops?: any[];
    returnDateTime?: string;
    returnPickup?: any;
    returnDropoff?: any;
    returnAdditionalStops?: any[];
    hours?: number;
    days?: number;
    fleetConfig?: any;
    distance?: number | null;
    duration?: number | null;
    extras?: string[];
  }; // Trip metadata for independent quotes
  // 🆕 NEW: Dual quote stop pricing metadata
  route_metrics?: {
    direct_distance_miles: number;
    direct_duration_minutes: number;
    full_distance_miles: number;
    full_duration_minutes: number;
    detour_distance_miles: number;
    detour_duration_minutes: number;
    calculation_method: string;
    calculated_at: string;
  };
  pricing_logic?: {
    direct_quote_pence: number;
    full_quote_pence: number;
    final_quote_pence: number;
    stop_grace_applied: boolean;
    grace_threshold_miles: number;
    grace_threshold_minutes: number;
    pricing_strategy: 'direct' | 'full';
    decision_reason: string;
    pricing_version_id?: string;
  };
  // 🆕 NEW: Legs snapshot for multi-leg bookings (RETURN, FLEET)
  legs?: import('../../types/pricing.types').LegSnapshotData[];
}

export interface LineItems {
  components: LineItemComponent[];
  discounts: LineItemDiscount[];
  multipliers: LineItemMultiplier[];
  summary: LineItemSummary;
  meta: LineItemMeta;
}

/**
 * Build line items from booking-level breakdown
 * 🆕 NEW: Accepts routeMetrics and dualQuotePricing for dual quote stop pricing
 */
export function buildBookingLineItems(
  breakdown: PricingBreakdownData,
  subtotalPence: number,
  discountPence: number,
  vatPence: number,
  totalPence: number,
  tripMetadata?: any,
  routeMetrics?: RouteMetrics,
  dualQuotePricing?: DualQuotePricingLogic,
  legs?: LegBreakdown[]  // 🆕 NEW: Optional legs parameter for multi-leg bookings
): LineItems {
  // Validate legs data consistency if provided
  if (legs && legs.length > 0) {
    validateLegsData(legs, subtotalPence, discountPence, totalPence);
  }
  return {
    components: [
      { code: 'base_fare', label: 'Base fare', amount_pence: Math.round(breakdown.baseFare * 100) },
      { code: 'distance_fee', label: 'Distance fee', amount_pence: Math.round(breakdown.distanceFee * 100) },
      { code: 'time_fee', label: 'Time fee', amount_pence: Math.round(breakdown.timeFee * 100) },
      { code: 'airport_fees', label: 'Airport fees', amount_pence: Math.round(breakdown.airportFees * 100) },
      { code: 'zone_fees', label: 'Zone fees', amount_pence: Math.round(breakdown.zoneFees * 100) },
      { code: 'toll_fees', label: 'Toll fees', amount_pence: Math.round(breakdown.tollFees * 100) },
      { code: 'multi_stop_fees', label: 'Multi-stop fees', amount_pence: Math.round(breakdown.multiStopFees * 100) },
      { code: 'service_item_fees', label: 'Service Item Fees', amount_pence: Math.round(breakdown.serviceItemFees * 100) }
    ].filter(c => c.amount_pence > 0),

    discounts: breakdown.discounts.total > 0
      ? [{
        code: 'discount',
        label: 'Discount',
        amount_pence: Math.round(breakdown.discounts.total * 100)
      }]
      : [],

    multipliers: Object.entries(breakdown.multipliers).map(([code, factor]) => ({
      code,
      label: code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      factor: factor as number
    })),

    summary: {
      subtotal_pence: subtotalPence,
      discount_pence: discountPence,
      vat_pence: vatPence,
      total_pence: totalPence
    },

    meta: {
      calc_source: 'pricing_engine_v2',
      calc_version: '2.1.0',  // Bump version for legs snapshot support
      snapshot_format: legs && legs.length > 0 ? 'booking_and_legs_v1' : 'booking_only_v1',
      trip: tripMetadata,
      // 🆕 NEW: Include route metrics if available (dual quote pricing)
      route_metrics: routeMetrics ? {
        direct_distance_miles: routeMetrics.directDistance || 0,
        direct_duration_minutes: routeMetrics.directDuration || 0,
        full_distance_miles: routeMetrics.fullDistance || 0,
        full_duration_minutes: routeMetrics.fullDuration || 0,
        detour_distance_miles: routeMetrics.detourDistance || 0,
        detour_duration_minutes: routeMetrics.detourDuration || 0,
        calculation_method: 'google_maps_api',
        calculated_at: new Date().toISOString()
      } : undefined,
      // 🆕 NEW: Include pricing logic if available (dual quote pricing)
      pricing_logic: dualQuotePricing ? {
        direct_quote_pence: dualQuotePricing.directQuotePence,
        full_quote_pence: dualQuotePricing.fullQuotePence,
        final_quote_pence: dualQuotePricing.finalQuotePence,
        stop_grace_applied: dualQuotePricing.stopGraceApplied,
        grace_threshold_miles: dualQuotePricing.graceThresholdMiles,
        grace_threshold_minutes: dualQuotePricing.graceThresholdMinutes,
        pricing_strategy: dualQuotePricing.pricingStrategy,
        decision_reason: dualQuotePricing.stopGraceApplied
          ? `Detour within grace threshold (${dualQuotePricing.graceThresholdMiles}mi / ${dualQuotePricing.graceThresholdMinutes}min) - using direct quote`
          : `Detour exceeds grace threshold (${dualQuotePricing.graceThresholdMiles}mi / ${dualQuotePricing.graceThresholdMinutes}min) - using full quote`
      } : undefined,
      // 🆕 NEW: Legs snapshot for multi-leg bookings
      legs: legs && legs.length > 0 ? legs.map(leg => ({
        leg_number: leg.leg_number,
        leg_kind: leg.leg_kind,
        vehicle_category: leg.vehicle_category,
        vehicle_unit_index: leg.vehicle_unit_index,
        pickup: leg.pickup,
        dropoff: leg.dropoff,
        stops: leg.stops,
        scheduled_at: leg.scheduled_at,
        distance_miles: leg.distance_miles,
        duration_min: leg.duration_min,
        pricing: {
          base_fare_pence: Math.round(leg.pricing.baseFare * 100),
          distance_fee_pence: Math.round(leg.pricing.distanceFee * 100),
          time_fee_pence: Math.round(leg.pricing.timeFee * 100),
          multi_stop_fee_pence: Math.round(leg.pricing.multiStopFee * 100),
          waiting_fees_pence: Math.round(leg.pricing.waitingFees * 100),
          airport_fees_pence: Math.round(leg.pricing.airportFees * 100),
          zone_fees_pence: Math.round(leg.pricing.zoneFees * 100),
          toll_fees_pence: Math.round(leg.pricing.tollFees * 100),
          service_item_fees_pence: Math.round(leg.pricing.serviceItemFees * 100),
          subtotal_pence: Math.round(leg.pricing.subtotal * 100),
          discount_pence: Math.round(leg.pricing.discount * 100),
          vat_pence: 0,  // Currently 0 per leg, VAT calculated at booking level
          total_pence: Math.round(leg.pricing.finalPrice * 100),
          multipliers: leg.pricing.multipliers,
          details: leg.pricing.details.map(d => ({
            component: d.component,
            amount_pence: Math.round(d.amount * 100),
            description: d.description
          }))
        }
      } as import('../../types/pricing.types').LegSnapshotData)) : undefined
    }
  };
}

/**
 * Validate legs data consistency with booking totals
 * Ensures legs sum matches booking-level amounts (with tolerance for rounding)
 */
function validateLegsData(
  legs: LegBreakdown[],
  bookingSubtotalPence: number,
  bookingDiscountPence: number,
  bookingTotalPence: number
): void {
  // Sum leg subtotals
  const legsSubtotalSum = legs.reduce(
    (sum, leg) => sum + Math.round(leg.pricing.subtotal * 100),
    0
  );

  // Sum leg discounts
  const legsDiscountSum = legs.reduce(
    (sum, leg) => sum + Math.round(leg.pricing.discount * 100),
    0
  );

  // Sum leg totals
  const legsTotalSum = legs.reduce(
    (sum, leg) => sum + Math.round(leg.pricing.finalPrice * 100),
    0
  );

  // Allow 2 pence tolerance for rounding
  const TOLERANCE_PENCE = 2;

  // Validate subtotal
  const subtotalDiff = Math.abs(legsSubtotalSum - bookingSubtotalPence);
  if (subtotalDiff > TOLERANCE_PENCE) {
    throw new Error(
      `Legs subtotal mismatch: legs sum ${legsSubtotalSum}p, ` +
      `booking ${bookingSubtotalPence}p, diff ${subtotalDiff}p`
    );
  }

  // Validate discount
  const discountDiff = Math.abs(legsDiscountSum - bookingDiscountPence);
  if (discountDiff > TOLERANCE_PENCE) {
    throw new Error(
      `Legs discount mismatch: legs sum ${legsDiscountSum}p, ` +
      `booking ${bookingDiscountPence}p, diff ${discountDiff}p`
    );
  }

  // Validate total
  const totalDiff = Math.abs(legsTotalSum - bookingTotalPence);
  if (totalDiff > TOLERANCE_PENCE) {
    throw new Error(
      `Legs total mismatch: legs sum ${legsTotalSum}p, ` +
      `booking ${bookingTotalPence}p, diff ${totalDiff}p`
    );
  }
}

/**
 * Build line items from leg-level breakdown
 */
export function buildLegLineItems(
  legPricing: LegBreakdown['pricing'],
  subtotalPence: number,
  discountPence: number,
  vatPence: number,
  totalPence: number
): LineItems {
  return {
    components: [
      { code: 'base_fare', label: 'Base fare', amount_pence: Math.round(legPricing.baseFare * 100) },
      { code: 'distance_fee', label: 'Distance fee', amount_pence: Math.round(legPricing.distanceFee * 100) },
      { code: 'time_fee', label: 'Time fee', amount_pence: Math.round(legPricing.timeFee * 100) },
      { code: 'airport_fee', label: 'Airport fee', amount_pence: Math.round(legPricing.airportFees * 100) },
      { code: 'zone_fee', label: 'Zone fee', amount_pence: Math.round(legPricing.zoneFees * 100) },
      { code: 'toll_fee', label: 'Toll fee', amount_pence: Math.round(legPricing.tollFees * 100) },
      { code: 'multi_stop_fee', label: 'Multi-stop fee', amount_pence: Math.round(legPricing.multiStopFee * 100) },
      { code: 'waiting_fees', label: 'Waiting fees', amount_pence: Math.round(legPricing.waitingFees * 100) },
      { code: 'service_item_fees', label: 'Service Item Fees', amount_pence: Math.round(legPricing.serviceItemFees * 100) }
    ].filter(c => c.amount_pence > 0),

    discounts: discountPence > 0
      ? [{ code: 'leg_discount', label: 'Discount', amount_pence: discountPence }]
      : [],

    multipliers: legPricing.multipliers
      ? Object.entries(legPricing.multipliers).map(([code, factor]) => ({
        code,
        label: code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        factor: factor as number
      }))
      : [],

    summary: {
      subtotal_pence: subtotalPence,
      discount_pence: discountPence,
      vat_pence: vatPence,
      total_pence: totalPence
    },

    meta: {
      calc_source: 'pricing_engine_v2',
      calc_version: '2.0.0'
    }
  };
}

/**
 * Build trip metadata for independent quotes
 * Includes all fields from new normalized model
 */
export function buildTripMetadata(requestData: NormalizedPricingRequest): any {
  const baseMetadata = {
    bookingType: requestData.bookingType,
    dateTime: requestData.dateTime,
    pickup: requestData.pickup,
    extras: requestData.extras ?? [],
    // Keep tripPreferences separate for driver visibility (not in extras array)
    ...(requestData.tripPreferences && { tripPreferences: requestData.tripPreferences }),
    // Trip logistics
    ...(requestData.passengers && { passengers: requestData.passengers }),
    ...(requestData.luggage && { luggage: requestData.luggage }),
    ...(requestData.flightNumber && { flightNumber: requestData.flightNumber }),
    ...(requestData.customRequirements && { customRequirements: requestData.customRequirements })
  };

  // Add booking-type-specific fields
  switch (requestData.bookingType) {
    case BookingType.ONE_WAY:
      return {
        ...baseMetadata,
        vehicleType: requestData.vehicleType,
        dropoff: requestData.dropoff,
        additionalStops: requestData.additionalStops ?? [],
        distance: requestData.distance ? Math.round(requestData.distance) : null,
        duration: requestData.duration ? Math.round(requestData.duration) : null
      };

    case BookingType.RETURN:
      return {
        ...baseMetadata,
        vehicleType: requestData.vehicleType,
        dropoff: requestData.dropoff,
        additionalStops: requestData.additionalStops ?? [],
        returnDateTime: requestData.returnDateTime,
        returnPickup: requestData.returnPickup ?? null,
        returnDropoff: requestData.returnDropoff ?? null,
        returnAdditionalStops: requestData.returnAdditionalStops ?? [],
        distance: requestData.distance ? Math.round(requestData.distance) : null,
        duration: requestData.duration ? Math.round(requestData.duration) : null
      };

    case BookingType.HOURLY:
      return {
        ...baseMetadata,
        vehicleType: requestData.vehicleType,
        dropoff: requestData.dropoff ?? null,
        hours: requestData.hours
      };

    case BookingType.DAILY:
      return {
        ...baseMetadata,
        vehicleType: requestData.vehicleType,
        dropoff: requestData.dropoff ?? null,
        days: requestData.days
      };

    case BookingType.FLEET:
      return {
        ...baseMetadata,
        baseServiceType: requestData.baseServiceType ?? null,
        hours: requestData.hours ?? null,
        days: requestData.days ?? null,
        fleetConfig: requestData.fleetConfig,
        // NOTE: Fleet config is just vehicle counts (e.g., {EXECUTIVE: 2, LUXURY: 1})
        // Individual trip details are in the legs breakdown, not in fleetConfig
        distance: requestData.distance ? Math.round(requestData.distance) : null,
        duration: requestData.duration ? Math.round(requestData.duration) : null
      };

    default:
      return baseMetadata;
  }
}

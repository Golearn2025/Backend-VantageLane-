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
  BookingType
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
 */
export function buildBookingLineItems(
  breakdown: PricingBreakdownData,
  subtotalPence: number,
  discountPence: number,
  vatPence: number,
  totalPence: number,
  tripMetadata?: any
): LineItems {
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
      calc_version: '2.0.0',
      ...(tripMetadata && { trip: tripMetadata })
    }
  };
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
    extras: requestData.extras ?? []
  };

  // Add booking-type-specific fields
  switch (requestData.bookingType) {
    case BookingType.ONE_WAY:
      return {
        ...baseMetadata,
        vehicleType: requestData.vehicleType,
        dropoff: requestData.dropoff,
        additionalStops: requestData.additionalStops ?? [],
        distance: requestData.distance ?? null,
        duration: requestData.duration ?? null
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
        distance: requestData.distance ?? null,
        duration: requestData.duration ?? null
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
        fleetConfig: requestData.fleetConfig,
        // NOTE: Fleet config is just vehicle counts (e.g., {EXECUTIVE: 2, LUXURY: 1})
        // Individual trip details are in the legs breakdown, not in fleetConfig
        distance: requestData.distance ?? null,
        duration: requestData.duration ?? null
      };

    default:
      return baseMetadata;
  }
}

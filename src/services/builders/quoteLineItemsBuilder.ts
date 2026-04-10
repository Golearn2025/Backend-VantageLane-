/**
 * Quote Line Items Builder
 * 
 * Builds JSONB line_items structure for quotes
 * Separated from QuoteService to reduce complexity
 */

import { PricingResult, LegBreakdown, NormalizedPricingRequest } from '../../types/pricing.types';

export interface LineItemsStructure {
  components: Array<{
    code: string;
    label: string;
    amount_pence: number;
  }>;
  discounts: Array<{
    code: string;
    label: string;
    amount_pence: number;
  }>;
  multipliers: Array<{
    code: string;
    label: string;
    factor: number;
  }>;
  summary: {
    subtotal_pence: number;
    discount_pence: number;
    vat_pence: number;
    total_pence: number;
  };
  meta: {
    calc_source: string;
    calc_version: string;
    trip?: any;
  };
}

export class QuoteLineItemsBuilder {

  /**
   * Build line items for independent quote (Phase 2A)
   */
  static buildIndependentQuoteLineItems(
    pricingResult: PricingResult,
    requestData: NormalizedPricingRequest,
    subtotalPence: number,
    discountPence: number,
    vatPence: number,
    totalPence: number
  ): LineItemsStructure {
    const breakdown = pricingResult.bookingBreakdown;

    return {
      components: [
        { code: 'base_fare', label: 'Base fare', amount_pence: Math.round((breakdown?.baseFare || 0) * 100) },
        { code: 'distance_fee', label: 'Distance fee', amount_pence: Math.round((breakdown?.distanceFee || 0) * 100) },
        { code: 'time_fee', label: 'Time fee', amount_pence: Math.round((breakdown?.timeFee || 0) * 100) },
        { code: 'airport_fees', label: 'Airport fees', amount_pence: Math.round((breakdown?.airportFees || 0) * 100) },
        { code: 'multi_stop_fees', label: 'Multi-stop fees', amount_pence: Math.round((breakdown?.multiStopFees || 0) * 100) },
        { code: 'service_item_fees', label: 'Service Item Fees', amount_pence: Math.round((breakdown?.serviceItemFees || 0) * 100) }
      ].filter(c => c.amount_pence > 0),

      discounts: (breakdown?.discounts?.total || 0) > 0
        ? [{ code: 'discount', label: 'Discount', amount_pence: Math.round((breakdown?.discounts?.total || 0) * 100) }]
        : [],

      multipliers: Object.entries(breakdown?.multipliers || {}).map(([code, factor]) => ({
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
        debug_marker: 'FLEET_METADATA_TEST_V2', // V2 MARKER
        trip: this.buildTripMetadata(requestData)
      } as any
    };
  }

  /**
   * Build line items for booking quote (with booking_id)
   */
  static buildBookingQuoteLineItems(
    pricingResult: PricingResult,
    requestData: NormalizedPricingRequest,
    subtotalPence: number,
    discountPence: number,
    vatPence: number,
    totalPence: number
  ): LineItemsStructure {
    // Same structure as independent quote for now
    return this.buildIndependentQuoteLineItems(
      pricingResult,
      requestData,
      subtotalPence,
      discountPence,
      vatPence,
      totalPence
    );
  }

  /**
   * Build line items for leg quote
   */
  static buildLegQuoteLineItems(
    leg: LegBreakdown,
    subtotalPence: number,
    discountPence: number,
    vatPence: number,
    totalPence: number
  ): LineItemsStructure {
    return {
      components: [
        { code: 'base_fare', label: 'Base fare', amount_pence: Math.round((leg.pricing?.baseFare || 0) * 100) },
        { code: 'distance_fee', label: 'Distance fee', amount_pence: Math.round((leg.pricing?.distanceFee || 0) * 100) },
        { code: 'time_fee', label: 'Time fee', amount_pence: Math.round((leg.pricing?.timeFee || 0) * 100) },
        { code: 'airport_fee', label: 'Airport fee', amount_pence: Math.round((leg.pricing?.airportFees || 0) * 100) },
        { code: 'zone_fee', label: 'Zone fee', amount_pence: Math.round((leg.pricing?.zoneFees || 0) * 100) },
        { code: 'toll_fee', label: 'Toll fee', amount_pence: Math.round((leg.pricing?.tollFees || 0) * 100) },
        { code: 'service_item_fees', label: 'Service Item Fees', amount_pence: Math.round((leg.pricing?.serviceItemFees || 0) * 100) }
      ].filter(c => c.amount_pence > 0),

      discounts: [],
      multipliers: [],

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
   * Build trip metadata from normalized request
   * Handles all booking types with proper field extraction
   */
  private static buildTripMetadata(requestData: NormalizedPricingRequest): any {
    // V2 MARKER - IMPOSSIBLE TO MISS
    console.error('🔥🔥🔥 BUILD TRIP METADATA HIT V2 🔥🔥🔥');
    console.error('🔴 buildTripMetadata input =', JSON.stringify(requestData, null, 2));

    const req = requestData as any; // Cast to access optional fields

    const metadata = {
      pickup: requestData.pickup,
      dropoff: req.dropoff ?? null,
      dateTime: requestData.dateTime,
      bookingType: requestData.bookingType,
      vehicleType: req.vehicleType ?? null,
      vehicleModel: req.vehicleModel ?? null,
      distance: req.distance ?? null,
      duration: req.duration ?? null,
      coordinates: req.coordinates ?? null,
      hours: req.hours ?? null,
      days: req.days ?? null,
      extras: requestData.extras ?? [],
      additionalStops: req.additionalStops ?? null,
      // FLEET-specific
      baseServiceType: req.baseServiceType ?? null,
      fleetConfig: req.fleetConfig ?? null,
      // RETURN-specific
      returnPickup: req.returnPickup ?? null,
      returnDropoff: req.returnDropoff ?? null,
      returnDateTime: req.returnDateTime ?? null,
      returnAdditionalStops: req.returnAdditionalStops ?? null
    };

    // FINAL LOG: Show exactly what will be saved to DB
    if (requestData.bookingType === 'fleet') {
      console.error('🔴🔴🔴 FINAL METADATA TO DB:', JSON.stringify(metadata, null, 2));
    }

    return metadata;
  }
}

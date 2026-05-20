/**
 * Quote Persistence Service
 * 
 * Handles ONLY database persistence for quotes:
 * - Independent quotes (Phase 2A: booking_id = NULL)
 * - Booking quotes (Phase 2B: booking_id set)
 * - Leg quotes (per operational leg)
 */

import { supabase } from '../../config/supabase';
import { PricingResult, LegBreakdown, NormalizedPricingRequest } from '../../types/pricing.types';
import { OrganizationSettingsService } from '../OrganizationSettingsService';
import { QuoteAmountsMapper } from '../mappers/quoteAmountsMapper';
import { buildBookingLineItems, buildLegLineItems, buildTripMetadata } from './quoteLineItemsBuilder';

export interface QuoteCreationResult {
  booking_quote_id: string;
  leg_quote_ids: string[];
  success: boolean;
  error?: string;
}

export class QuotePersistenceService {

  /**
   * Create independent quote (Phase 2A)
   * 
   * CRITICAL NOTES:
   * - booking_id = NULL (independent quote)
   * - VAT from organization_settings.vat_rate (0 = no change to client total)
   * - Per-leg truth stored in booking quote JSON (no client_leg_quotes yet)
   * - Trip metadata persisted for safe quote → booking conversion
   */
  static async createIndependentQuote(
    pricingResult: PricingResult,
    requestData: NormalizedPricingRequest,
    organizationId: string
  ): Promise<QuoteCreationResult> {
    try {
      console.log('🎯 Creating independent quote for organization:', organizationId);

      const breakdown = pricingResult.bookingBreakdown;
      if (!breakdown) {
        throw new Error('Missing bookingBreakdown in PricingResult');
      }

      const settings = await OrganizationSettingsService.getOrganizationSettings(organizationId);
      const amounts = QuoteAmountsMapper.calculateIndependentQuoteAmounts(
        pricingResult,
        settings.vat_rate
      );
      const { subtotalPence, discountPence, vatPence, totalPence, vatRate } = amounts;

      // Vehicle vs Services split
      const vehicleSubtotalPence = Math.round((
        breakdown.baseFare +
        breakdown.distanceFee +
        breakdown.timeFee +
        breakdown.airportFees +
        breakdown.zoneFees +
        breakdown.tollFees
      ) * 100);
      const servicesSubtotalPence = Math.round(breakdown.serviceItemFees * 100);

      // Build line items with trip metadata
      const tripMetadata = buildTripMetadata(requestData);
      // 🆕 NEW: Pass route metrics, dual quote pricing, and legs to line items builder
      const lineItems = buildBookingLineItems(
        breakdown,
        subtotalPence,
        discountPence,
        vatPence,
        totalPence,
        tripMetadata,
        pricingResult.routeMetrics,
        pricingResult.dualQuotePricing,
        pricingResult.legs  // 🆕 NEW: Pass legs array for multi-leg bookings
      );

      // Insert independent quote
      const { data, error } = await supabase
        .from('client_booking_quotes')
        .insert({
          booking_id: null, // Phase 2A: Independent quote
          organization_id: organizationId,
          version: 1,
          is_locked: false,
          quote_valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          currency: pricingResult.currency || 'GBP',
          pricing_version_id: pricingResult.pricing_version_id || null,

          // Pricing fields
          subtotal_pence: subtotalPence,
          discount_pence: discountPence,
          vat_rate: vatRate,
          vat_pence: vatPence,
          total_pence: totalPence,

          // Vehicle vs Services split
          vehicle_subtotal_pence: vehicleSubtotalPence,
          vehicle_discount_pence: 0,
          services_subtotal_pence: servicesSubtotalPence,
          services_discount_pence: 0,

          // Line items with trip metadata
          line_items: lineItems,

          // 🆕 NEW: Total route metrics (primary source for financial calculations)
          total_distance_miles: pricingResult.routeMetrics?.fullDistance ||
            (pricingResult.legs?.[0]?.distance_miles) || null,
          total_duration_minutes: pricingResult.routeMetrics?.fullDuration ?
            Math.round(pricingResult.routeMetrics.fullDuration) :
            (pricingResult.legs?.[0]?.duration_min) || null,

          // 🆕 NEW: Route metrics columns (dual quote stop pricing)
          direct_distance_miles: pricingResult.routeMetrics?.directDistance || null,
          direct_duration_minutes: pricingResult.routeMetrics?.directDuration ? Math.round(pricingResult.routeMetrics.directDuration) : null,
          full_distance_miles: pricingResult.routeMetrics?.fullDistance || null,
          full_duration_minutes: pricingResult.routeMetrics?.fullDuration ? Math.round(pricingResult.routeMetrics.fullDuration) : null,
          detour_distance_miles: pricingResult.routeMetrics?.detourDistance || null,
          detour_duration_minutes: pricingResult.routeMetrics?.detourDuration ? Math.round(pricingResult.routeMetrics.detourDuration) : null,

          // 🆕 NEW: Pricing logic columns (dual quote stop pricing)
          direct_quote_pence: pricingResult.dualQuotePricing?.directQuotePence || null,
          full_quote_pence: pricingResult.dualQuotePricing?.fullQuotePence || null,
          stop_grace_applied: pricingResult.dualQuotePricing?.stopGraceApplied || null,
          stop_grace_threshold_miles: pricingResult.dualQuotePricing?.graceThresholdMiles || null,
          stop_grace_threshold_minutes: pricingResult.dualQuotePricing?.graceThresholdMinutes || null,
          stop_pricing_strategy: pricingResult.dualQuotePricing?.pricingStrategy || null,

          // Metadata
          calc_source: 'pricing_engine_v2',
          calc_version: '2.0.0',
          calculated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_current: true
        })
        .select('id')
        .single();

      if (error) {
        console.error('❌ Error creating independent quote:', error);
        throw new Error(`Failed to create independent quote: ${error.message}`);
      }

      console.log('✅ Independent quote created:', data.id);

      return {
        booking_quote_id: data.id,
        leg_quote_ids: [], // Phase 2A: No leg quotes yet
        success: true
      };

    } catch (error: any) {
      console.error('❌ Error in createIndependentQuote:', error);
      return {
        booking_quote_id: '',
        leg_quote_ids: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create booking quote with leg quotes (Phase 2B)
   * 
   * CRITICAL NOTES:
   * - booking_id is set (bound to booking)
   * - Creates client_leg_quotes for each operational leg
   * - VAT calculated and applied
   */
  static async createBookingQuote(
    pricingResult: PricingResult,
    requestData: NormalizedPricingRequest,
    organizationId: string,
    bookingId: string
  ): Promise<QuoteCreationResult> {
    try {
      console.log('🎯 Creating booking quote for booking:', bookingId);

      // Step 1: Create leg quotes
      const legQuoteIds: string[] = [];
      if (pricingResult.legs && pricingResult.legs.length > 0) {
        for (const leg of pricingResult.legs) {
          const legQuoteId = await this.createLegQuote(leg, organizationId, bookingId);
          legQuoteIds.push(legQuoteId);
        }
      }

      // Step 2: Create booking quote (aggregated)
      const bookingQuoteId = await this.createAggregatedBookingQuote(
        pricingResult,
        legQuoteIds,
        organizationId,
        bookingId
      );

      console.log(`✅ Booking quote created: ${bookingQuoteId}, legs: ${legQuoteIds.length}`);

      return {
        booking_quote_id: bookingQuoteId,
        leg_quote_ids: legQuoteIds,
        success: true
      };

    } catch (error: any) {
      console.error('❌ Error in createBookingQuote:', error);
      return {
        booking_quote_id: '',
        leg_quote_ids: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create individual leg quote
   * 
   * CRITICAL REQUIREMENT:
   * - This can ONLY be called AFTER booking_legs have been created
   * - leg.booking_leg_id MUST be a real booking_legs.id, not invented
   * - If booking_legs don't exist yet, this will fail FK constraint
   * 
   * USAGE:
   * - Phase 2A (independent quote): DO NOT call this (no booking_legs yet)
   * - Phase 2B (booking quote): Call this AFTER booking_legs are created
   */
  private static async createLegQuote(
    leg: LegBreakdown,
    organizationId: string,
    bookingId: string
  ): Promise<string> {
    // CRITICAL: Use real booking_leg_id from LegBreakdown
    // This MUST come from an actual booking_legs.id record
    if (!leg.booking_leg_id) {
      throw new Error('CRITICAL: leg.booking_leg_id is required. booking_legs must be created before leg quotes.');
    }

    const bookingLegId = leg.booking_leg_id;

    const settings = await OrganizationSettingsService.getOrganizationSettings(organizationId);
    const amounts = QuoteAmountsMapper.calculateLegQuoteAmounts(leg, settings.vat_rate);
    const { subtotalPence, discountPence, vatPence, totalPence, vatRate } = amounts;

    const lineItems = buildLegLineItems(
      leg.pricing,
      subtotalPence,
      discountPence,
      vatPence,
      totalPence
    );

    const { data, error } = await supabase
      .from('client_leg_quotes')
      .insert({
        booking_id: bookingId,
        booking_leg_id: bookingLegId,
        organization_id: organizationId,
        version: 1,
        is_locked: false,
        currency: 'GBP',

        // Pricing fields
        subtotal_pence: subtotalPence,
        discount_pence: discountPence,
        vat_rate: vatRate,
        vat_pence: vatPence,
        total_pence: totalPence,

        // Line items
        line_items: lineItems,

        // Metadata
        calc_source: 'pricing_engine_v2',
        calc_version: '2.0.0',
        calculated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Error creating leg quote:', error);
      throw new Error(`Failed to create leg quote: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Create aggregated booking quote
   * 
   * NOTE: Trip metadata not needed here since it's already in independent quote
   * or will be in booking record. This is just the pricing aggregation.
   */
  private static async createAggregatedBookingQuote(
    pricingResult: PricingResult,
    legQuoteIds: string[],
    organizationId: string,
    bookingId: string
  ): Promise<string> {
    const breakdown = pricingResult.bookingBreakdown;
    if (!breakdown) {
      throw new Error('Missing bookingBreakdown in PricingResult');
    }

    const settings = await OrganizationSettingsService.getOrganizationSettings(organizationId);
    const amounts = QuoteAmountsMapper.calculateBookingQuoteAmounts(
      pricingResult,
      settings.vat_rate
    );
    const { subtotalPence, discountPence, vatPence, totalPence, vatRate } = amounts;

    // Vehicle vs Services split
    const vehicleSubtotalPence = Math.round((
      breakdown.baseFare +
      breakdown.distanceFee +
      breakdown.timeFee +
      breakdown.airportFees +
      breakdown.zoneFees +
      breakdown.tollFees
    ) * 100);
    const servicesSubtotalPence = Math.round(breakdown.serviceItemFees * 100);

    const lineItems = buildBookingLineItems(
      breakdown,
      subtotalPence,
      discountPence,
      vatPence,
      totalPence
    );

    const { data, error } = await supabase
      .from('client_booking_quotes')
      .insert({
        booking_id: bookingId,
        organization_id: organizationId,
        version: 1,
        is_locked: false,
        quote_valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        currency: pricingResult.currency || 'GBP',
        pricing_version_id: pricingResult.pricing_version_id || null,

        // Pricing fields
        subtotal_pence: subtotalPence,
        discount_pence: discountPence,
        vat_rate: vatRate,
        vat_pence: vatPence,
        total_pence: totalPence,

        // Vehicle vs Services split
        vehicle_subtotal_pence: vehicleSubtotalPence,
        vehicle_discount_pence: 0,
        services_subtotal_pence: servicesSubtotalPence,
        services_discount_pence: 0,

        // Line items
        line_items: lineItems,

        // Metadata
        calc_source: 'pricing_engine_v2',
        calc_version: '2.0.0',
        calculated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Error creating booking quote:', error);
      throw new Error(`Failed to create booking quote: ${error.message}`);
    }

    return data.id;
  }
}

/**
 * Quote Service (Thin Orchestrator)
 *
 * Orchestrates quote creation and retrieval
 * Delegates to specialized services:
 * - QuoteAmountsMapper: calculates money amounts
 * - QuoteToBookingService: handles quote→booking conversion
 */

import { supabase } from '../config/supabase';
import { PricingResult, NormalizedPricingRequest, LegBreakdown } from '../types/pricing.types';
import { buildBookingLineItems, buildLegLineItems, buildTripMetadata } from './quotes/quoteLineItemsBuilder';
import { QuoteAmountsMapper } from './mappers/quoteAmountsMapper';
import { QuoteToBookingService, QuoteToBookingResult } from './quoteToBookingService';

export interface QuoteCreationResult {
  booking_quote_id: string;
  leg_quote_ids: string[];
  success: boolean;
  error?: string;
}

export class QuoteService {

  /**
   * Create independent quote (Phase 2A)
   * Thin orchestrator - delegates to builder and mapper services
   */
  static async createIndependentQuote(
    pricingResult: PricingResult,
    requestData: NormalizedPricingRequest,
    organizationId: string
  ): Promise<QuoteCreationResult> {
    try {
      console.log('🎯 Creating independent quote for organization:', organizationId);

      // 🔵 DEBUG: Check if dual quote data is present
      console.log('🔵 DEBUG - PricingResult contains:');
      console.log('  routeMetrics:', pricingResult.routeMetrics);
      console.log('  dualQuotePricing:', pricingResult.dualQuotePricing);

      // LOG: Check requestData received
      if (requestData.bookingType === 'fleet') {
        console.error('🔴 QuoteService.createIndependentQuote - FLEET requestData:');
        console.error('  baseServiceType:', (requestData as any).baseServiceType);
        console.error('  hours:', (requestData as any).hours);
        console.error('  Full:', JSON.stringify(requestData, null, 2));
      }

      // Delegate amount calculations to mapper
      const amounts = QuoteAmountsMapper.calculateIndependentQuoteAmounts(pricingResult);
      const split = QuoteAmountsMapper.splitSubtotal(pricingResult);

      // Vehicle vs Services split (matching createBookingQuote semantics)
      const vehicleSubtotalPence = split.vehicleSubtotalPence;
      const servicesSubtotalPence = split.servicesSubtotalPence;

      const vehicleDiscountPence = 0; // No separate vehicle discount yet
      const servicesDiscountPence = 0; // No separate services discount yet

      // Build trip metadata and line items using the same code as QuotePersistenceService
      const tripMetadata = buildTripMetadata(requestData);
      // 🆕 NEW: Pass route metrics and dual quote pricing to line items builder
      const lineItems = buildBookingLineItems(
        pricingResult.bookingBreakdown!,
        amounts.subtotalPence,
        amounts.discountPence,
        amounts.vatPence,
        amounts.totalPence,
        tripMetadata,
        pricingResult.routeMetrics,
        pricingResult.dualQuotePricing
      );

      // LOG 2: lineItems before insert
      console.error('🔴 QUOTE INSERT line_items =', JSON.stringify(lineItems, null, 2));

      // Create independent quote with booking_id = NULL
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

          // Required pricing fields
          subtotal_pence: amounts.subtotalPence,
          discount_pence: amounts.discountPence,
          vat_rate: 0,
          vat_pence: amounts.vatPence,
          total_pence: amounts.totalPence,

          // Vehicle vs Services split
          vehicle_subtotal_pence: vehicleSubtotalPence,
          vehicle_discount_pence: vehicleDiscountPence,
          services_subtotal_pence: servicesSubtotalPence,
          services_discount_pence: servicesDiscountPence,

          // Use lineItems variable
          line_items: lineItems,

          // 🆕 NEW: Route metrics columns (dual quote stop pricing)
          direct_distance_miles: pricingResult.routeMetrics?.directDistance || null,
          direct_duration_minutes: pricingResult.routeMetrics?.directDuration || null,
          full_distance_miles: pricingResult.routeMetrics?.fullDistance || null,
          full_duration_minutes: pricingResult.routeMetrics?.fullDuration || null,
          detour_distance_miles: pricingResult.routeMetrics?.detourDistance || null,
          detour_duration_minutes: pricingResult.routeMetrics?.detourDuration || null,

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
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw new Error(`Failed to create independent quote: ${error.message}`);
      }

      console.log('✅ Independent quote created successfully:', data.id);

      // LOG 3: Fetch exact DB row immediately after insert
      const { data: dbRow, error: fetchError } = await supabase
        .from('client_booking_quotes')
        .select('id, line_items')
        .eq('id', data.id)
        .single();

      if (dbRow) {
        console.error('🔴 DB ROW AFTER INSERT =', JSON.stringify(dbRow.line_items, null, 2));
      } else {
        console.error('❌ Failed to fetch DB row:', fetchError);
      }

      return {
        booking_quote_id: data.id,
        leg_quote_ids: [], // No leg quotes for independent quotes (Phase 2A)
        success: true
      };

    } catch (error) {
      console.error('❌ Error in createIndependentQuote:', error);
      return {
        booking_quote_id: '',
        leg_quote_ids: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create complete quote (legs + booking)
   * Thin orchestrator - delegates to builders/mappers
   *
   * NOTE: booking_id is required for this method. For independent quotes (Phase 2A),
   * use createIndependentQuote() instead.
   */
  static async createQuote(
    pricingResult: PricingResult,
    requestData: NormalizedPricingRequest,
    organizationId: string,
    bookingId?: string
  ): Promise<QuoteCreationResult> {
    try {
      // If no booking_id provided, skip quote persistence (just return pricing result)
      if (!bookingId) {
        console.log('⚠️  No booking_id provided - skipping quote persistence');
        return {
          booking_quote_id: '',
          leg_quote_ids: [],
          success: true
        };
      }

      // Step 1: Create leg quotes
      const legQuoteIds: string[] = [];

      if (pricingResult.legs && pricingResult.legs.length > 0) {
        for (const leg of pricingResult.legs) {
          const legQuoteId = await this.createLegQuote(leg, organizationId, bookingId);
          legQuoteIds.push(legQuoteId);
        }
      }

      // Step 2: Create booking quote (aggregated)
      const bookingQuoteId = await this.createBookingQuote(
        pricingResult,
        requestData,
        legQuoteIds,
        organizationId,
        bookingId
      );

      console.log(`✅ Quote created: booking_quote_id=${bookingQuoteId}, booking_id=${bookingId}, legs=${legQuoteIds.length}`);

      return {
        booking_quote_id: bookingQuoteId,
        leg_quote_ids: legQuoteIds,
        success: true
      };

    } catch (error: any) {
      console.error('❌ Error creating quote:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
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
   * Delegates to QuoteAmountsMapper and QuoteLineItemsBuilder
   */
  private static async createLegQuote(
    leg: LegBreakdown,
    organizationId: string,
    bookingId: string
  ): Promise<string> {
    const bookingLegId = crypto.randomUUID();

    // Delegate amount calculations to mapper
    const amounts = QuoteAmountsMapper.calculateLegQuoteAmounts(leg, 0.20);

    const { data, error } = await supabase
      .from('client_leg_quotes')
      .insert({
        booking_id: bookingId,
        booking_leg_id: bookingLegId,
        organization_id: organizationId,
        version: 1,
        is_locked: false,
        currency: 'GBP',

        // Amounts from mapper
        subtotal_pence: amounts.subtotalPence,
        discount_pence: amounts.discountPence,
        vat_rate: 0.20,
        vat_pence: amounts.vatPence,
        total_pence: amounts.totalPence,

        // Delegate line items building to builder
        line_items: buildLegLineItems(
          leg.pricing,
          amounts.subtotalPence,
          amounts.discountPence,
          amounts.vatPence,
          amounts.totalPence
        ),

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
   * Create booking quote (aggregated from all legs)
   * Delegates to QuoteAmountsMapper and QuoteLineItemsBuilder
   */
  private static async createBookingQuote(
    pricingResult: PricingResult,
    requestData: NormalizedPricingRequest,
    legQuoteIds: string[],
    organizationId: string,
    bookingId: string
  ): Promise<string> {
    // Delegate amount calculations to mapper
    const amounts = QuoteAmountsMapper.calculateBookingQuoteAmounts(pricingResult);
    const split = QuoteAmountsMapper.splitSubtotal(pricingResult);

    // Build trip metadata before insert
    const tripMetadata = buildTripMetadata(requestData);

    // Create booking quote
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

        // Amounts from mapper
        subtotal_pence: amounts.subtotalPence,
        discount_pence: amounts.discountPence,
        vat_rate: 0.20,
        vat_pence: amounts.vatPence,
        total_pence: amounts.totalPence,

        // Vehicle vs Services split from mapper
        vehicle_subtotal_pence: split.vehicleSubtotalPence,
        vehicle_discount_pence: 0,
        services_subtotal_pence: split.servicesSubtotalPence,
        services_discount_pence: 0,

        // Delegate line items building to builder
        // 🆕 NEW: Pass route metrics and dual quote pricing
        line_items: buildBookingLineItems(
          pricingResult.bookingBreakdown!,
          amounts.subtotalPence,
          amounts.discountPence,
          amounts.vatPence,
          amounts.totalPence,
          tripMetadata,
          pricingResult.routeMetrics,
          pricingResult.dualQuotePricing
        ),

        // 🆕 NEW: Route metrics columns (dual quote stop pricing)
        direct_distance_miles: pricingResult.routeMetrics?.directDistance || null,
        direct_duration_minutes: pricingResult.routeMetrics?.directDuration || null,
        full_distance_miles: pricingResult.routeMetrics?.fullDistance || null,
        full_duration_minutes: pricingResult.routeMetrics?.fullDuration || null,
        detour_distance_miles: pricingResult.routeMetrics?.detourDistance || null,
        detour_duration_minutes: pricingResult.routeMetrics?.detourDuration || null,

        // 🆕 NEW: Pricing logic columns (dual quote stop pricing)
        direct_quote_pence: pricingResult.dualQuotePricing?.directQuotePence || null,
        full_quote_pence: pricingResult.dualQuotePricing?.fullQuotePence || null,
        stop_grace_applied: pricingResult.dualQuotePricing?.stopGraceApplied || null,
        stop_grace_threshold_miles: pricingResult.dualQuotePricing?.graceThresholdMiles || null,
        stop_grace_threshold_minutes: pricingResult.dualQuotePricing?.graceThresholdMinutes || null,
        stop_pricing_strategy: pricingResult.dualQuotePricing?.pricingStrategy || null,

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
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw new Error(`Failed to create booking quote: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Get quote by ID
   */
  static async getQuote(quoteId: string): Promise<any> {
    const { data, error } = await supabase
      .from('client_booking_quotes')
      .select(`
        *,
        leg_quotes:client_leg_quotes(*)
      `)
      .eq('id', quoteId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch quote: ${error.message}`);
    }

    return data;
  }

  /**
   * Phase 2B: Convert independent quote to booking (ATOMIC via RPC)
   *
   * DESIGN NOTES:
   * - Converts Phase 2A independent quote (booking_id = NULL) to real booking
   * - Uses atomic RPC function for guaranteed consistency
   * - All operations succeed or fail together
   * - Enforces tenant ownership with organizationId validation
   *
   * IMPORTANT:
   * - This fixes invented-data issues by reading only real persisted Phase 2A metadata
   * - This flow is now ATOMIC via PostgreSQL RPC
   */
  static async convertQuoteToBooking(
    quoteId: string,
    organizationId: string,
    customerData: {
      customerId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    },
    bookingData?: {
      passengerCount?: number;
      bagCount?: number;
      notes?: string;
      preferences?: Record<string, any>;
    }
  ): Promise<QuoteToBookingResult> {
    return QuoteToBookingService.convertQuoteToBooking(
      quoteId,
      organizationId,
      customerData,
      bookingData
    );
  }
}

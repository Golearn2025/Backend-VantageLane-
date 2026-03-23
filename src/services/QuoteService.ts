/**
 * Quote Service
 *
 * Handles persistence of pricing quotes to database:
 * 1. Create leg quotes (client_leg_quotes)
 * 2. Create booking quote (client_booking_quotes)
 */

import { supabase } from '../config/supabase';
import { LegBreakdown, PricingResult } from '../types/pricing.types';

export interface QuoteCreationResult {
  booking_quote_id: string;
  leg_quote_ids: string[];
  success: boolean;
  error?: string;
}

export class QuoteService {

  /**
   * Create independent quote (Phase 2A)
   * Creates a quote without booking_id for price estimation before booking creation
   * 
   * PHASE 2A DESIGN NOTES:
   * - These are client-facing independent quotes (booking_id = NULL)
   * - VAT is NOT calculated or persisted at this stage (vat_pence = 0, vat_rate = 0)
   * - Tax/VAT treatment will be applied later when quote is converted to booking
   * - total_pence uses PricingEngine.finalPrice for API consistency
   * - Financial snapshot becomes complete only at booking/invoicing stage
   */
  static async createIndependentQuote(
    pricingResult: PricingResult,
    requestData: any,
    organizationId: string
  ): Promise<QuoteCreationResult> {
    try {
      console.log('🎯 Creating independent quote for organization:', organizationId);

      // Calculate pricing totals from actual breakdown (FIXED for consistency)
      const breakdown = pricingResult.breakdown;
      const subtotalPence = Math.round((breakdown?.subtotal || 0) * 100);
      const discountPence = Math.round((breakdown?.discounts || 0) * 100);

      // CRITICAL FIX: Use PricingEngine.finalPrice for consistency with API response
      const totalPence = Math.round((pricingResult.finalPrice || 0) * 100);

      // Phase 2A: PricingEngine doesn't calculate VAT, so we set VAT to zero
      // VAT will be calculated later when quote is converted to booking
      const vatPence = 0;
      const vatRate = 0;

      // Vehicle vs Services split (matching createBookingQuote semantics)
      const vehicleSubtotalPence = Math.round(
        ((breakdown?.baseFare || 0) +
          (breakdown?.distanceFee || 0) +
          (breakdown?.timeFee || 0) +
          (breakdown?.additionalFees || 0)) * 100  // Include additionalFees like existing code
      );
      const servicesSubtotalPence = Math.round((breakdown?.services || 0) * 100);

      const vehicleDiscountPence = 0; // No separate vehicle discount yet
      const servicesDiscountPence = 0; // No separate services discount yet

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
          subtotal_pence: subtotalPence,
          discount_pence: discountPence,
          vat_rate: vatRate,
          vat_pence: vatPence,
          total_pence: totalPence,

          // Vehicle vs Services split
          vehicle_subtotal_pence: vehicleSubtotalPence,
          vehicle_discount_pence: vehicleDiscountPence,
          services_subtotal_pence: servicesSubtotalPence,
          services_discount_pence: servicesDiscountPence,

          // Line items as JSONB with Phase 2A trip metadata
          line_items: {
            components: [
              { code: 'base_fare', label: 'Base fare', amount_pence: Math.round((pricingResult.breakdown?.baseFare || 0) * 100) },
              { code: 'distance_fee', label: 'Distance fee', amount_pence: Math.round((pricingResult.breakdown?.distanceFee || 0) * 100) },
              { code: 'time_fee', label: 'Time fee', amount_pence: Math.round((pricingResult.breakdown?.timeFee || 0) * 100) },
              { code: 'additional_fees', label: 'Additional fees', amount_pence: Math.round((pricingResult.breakdown?.additionalFees || 0) * 100) },
              { code: 'service_item_fees', label: 'Service Item Fees', amount_pence: Math.round((pricingResult.breakdown?.services || 0) * 100) }
            ].filter(c => c.amount_pence > 0),
            discounts: (pricingResult.breakdown?.discounts || 0) > 0
              ? [{ code: 'discount', label: 'Discount', amount_pence: Math.round((pricingResult.breakdown?.discounts || 0) * 100) }]
              : [],
            multipliers: Object.entries(pricingResult.breakdown?.multipliers || {}).map(([code, factor]) => ({
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
            // Phase 2A: Persist trip metadata for safe quote -> booking conversion
            meta: {
              calc_source: 'pricing_engine_v2',
              calc_version: '2.0.0',
              trip: {
                pickup: requestData.pickup,
                dropoff: requestData.dropoff,
                dateTime: requestData.dateTime,
                bookingType: requestData.bookingType,
                vehicleType: requestData.vehicleType,
                distance: requestData.distance ?? null,
                duration: requestData.duration ?? null,
                coordinates: requestData.coordinates ?? null,
                hours: requestData.hours ?? null,
                days: requestData.days ?? null,
                extras: requestData.extras ?? []
              }
            }
          },

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
   * This is called after pricing calculation
   *
   * NOTE: booking_id is required for this method. For independent quotes (Phase 2A),
   * use createIndependentQuote() instead.
   */
  static async createQuote(
    pricingResult: PricingResult,
    requestData: any,
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
   */
  private static async createLegQuote(
    leg: LegBreakdown,
    organizationId: string,
    bookingId: string
  ): Promise<string> {
    const bookingLegId = crypto.randomUUID();

    const { data, error } = await supabase
      .from('client_leg_quotes')
      .insert({
        booking_id: bookingId,
        booking_leg_id: bookingLegId,
        organization_id: organizationId,
        version: 1,
        is_locked: false,
        currency: 'GBP',

        // Required fields with defaults
        subtotal_pence: Math.round((leg.pricing?.subtotal || 0) * 100),
        discount_pence: 0,
        vat_rate: 0.20,
        vat_pence: Math.round((leg.pricing?.subtotal || 0) * 100 * 0.20),
        total_pence: Math.round((leg.pricing?.leg_price || leg.pricing?.subtotal || 0) * 100),

        line_items: {
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
            subtotal_pence: Math.round((leg.pricing?.subtotal || 0) * 100),
            discount_pence: 0,
            vat_pence: Math.round((leg.pricing?.subtotal || 0) * 100 * 0.20),
            total_pence: Math.round((leg.pricing?.leg_price || leg.pricing?.subtotal || 0) * 100)
          },
          meta: {
            calc_source: 'pricing_engine_v2',
            calc_version: '2.0.0'
          }
        },

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
   */
  private static async createBookingQuote(
    pricingResult: PricingResult,
    requestData: any,
    legQuoteIds: string[],
    organizationId: string,
    bookingId: string
  ): Promise<string> {
    const subtotalPence = Math.round((pricingResult.breakdown?.subtotal || pricingResult.finalPrice || 0) * 100);
    const discountPence = Math.round((pricingResult.breakdown?.discounts || 0) * 100);
    const vatRate = 0.20;
    const vatPence = Math.round(subtotalPence * vatRate);
    const totalPence = subtotalPence + vatPence - discountPence;

    // Calculate vehicle vs services split
    const vehicleSubtotalPence = Math.round((
      (pricingResult.breakdown?.baseFare || 0) +
      (pricingResult.breakdown?.distanceFee || 0) +
      (pricingResult.breakdown?.timeFee || 0) +
      (pricingResult.breakdown?.additionalFees || 0)
    ) * 100);

    const servicesSubtotalPence = Math.round((pricingResult.breakdown?.services || 0) * 100);

    const vehicleDiscountPence = 0; // No separate vehicle discount yet
    const servicesDiscountPence = 0; // No separate services discount yet

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

        // Required pricing fields
        subtotal_pence: subtotalPence,
        discount_pence: discountPence,
        vat_rate: vatRate,
        vat_pence: vatPence,
        total_pence: totalPence,

        // Vehicle vs Services split
        vehicle_subtotal_pence: vehicleSubtotalPence,
        vehicle_discount_pence: vehicleDiscountPence,
        services_subtotal_pence: servicesSubtotalPence,
        services_discount_pence: servicesDiscountPence,

        // Line items as JSONB
        line_items: {
          components: [
            { code: 'base_fare', label: 'Base fare', amount_pence: Math.round((pricingResult.breakdown?.baseFare || 0) * 100) },
            { code: 'distance_fee', label: 'Distance fee', amount_pence: Math.round((pricingResult.breakdown?.distanceFee || 0) * 100) },
            { code: 'time_fee', label: 'Time fee', amount_pence: Math.round((pricingResult.breakdown?.timeFee || 0) * 100) },
            // NOTE: additional_fees is aggregated (airport+zone+toll) because pricingResult.breakdown doesn't have them separated
            { code: 'additional_fees', label: 'Additional fees', amount_pence: Math.round((pricingResult.breakdown?.additionalFees || 0) * 100) },
            { code: 'service_item_fees', label: 'Service Item Fees', amount_pence: Math.round((pricingResult.breakdown?.services || 0) * 100) }
          ].filter(c => c.amount_pence > 0),
          discounts: (pricingResult.breakdown?.discounts || 0) > 0
            ? [{ code: 'discount', label: 'Discount', amount_pence: Math.round((pricingResult.breakdown?.discounts || 0) * 100) }]
            : [],
          multipliers: Object.entries(pricingResult.breakdown?.multipliers || {}).map(([code, factor]) => ({
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
            calc_version: '2.0.0'
          }
        },

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
  ): Promise<{
    success: boolean;
    bookingId?: string;
    quoteId?: string;
    error?: string;
  }> {
    try {
      console.log('🎯 Phase 2B: Converting quote to booking (ATOMIC):', quoteId);

      // Call atomic RPC function
      const { data, error } = await supabase.rpc('convert_quote_to_booking_atomic', {
        p_quote_id: quoteId,
        p_organization_id: organizationId,
        p_customer_id: customerData.customerId,
        p_passenger_count: bookingData?.passengerCount || 1,
        p_bag_count: bookingData?.bagCount || 0,
        p_notes_internal: bookingData?.notes || ''
      });

      if (error) {
        console.error('❌ Phase 2B RPC error:', error);
        return {
          success: false,
          error: error.message,
          quoteId
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'RPC returned no data',
          quoteId
        };
      }

      // Parse JSONB result
      const result = typeof data === 'object' ? data : JSON.parse(data);

      if (!result.success) {
        return {
          success: false,
          error: result.error_message || 'Unknown RPC error',
          quoteId
        };
      }

      console.log('✅ Phase 2B: Quote successfully converted to booking (ATOMIC)');
      console.log(`  Quote ID: ${quoteId} → Booking ID: ${result.booking_id}`);

      return {
        success: true,
        bookingId: result.booking_id,
        quoteId: result.quote_id
      };
    } catch (error: any) {
      console.error('❌ Phase 2B: Error converting quote to booking:', error);

      return {
        success: false,
        error: error.message,
        quoteId
      };
    }
  }

  /**
   * Extract trip configuration from real quote metadata
   *
   * CRITICAL:
   * - Reads ONLY from persisted Phase 2A metadata
   * - NO invented data
   * - NO placeholders
   * - NO fallback defaults
   */
  private static extractTripConfigurationFromQuote(quote: any): {
    bookingType: string;
    scheduledAt: string;
    pickup: string;
    dropoff: string;
    distance: number | null;
    duration: number | null;
    vehicleCategory: string;
    coordinates: any;
    hours: number | null;
    days: number | null;
    extras: any[];
  } {
    const trip = quote?.line_items?.meta?.trip;

    if (
      !trip?.pickup ||
      !trip?.dropoff ||
      !trip?.dateTime ||
      !trip?.bookingType ||
      !trip?.vehicleType
    ) {
      throw new Error(
        'Quote missing required trip metadata for conversion. Required: pickup, dropoff, dateTime, bookingType, vehicleType'
      );
    }

    // Map booking type from frontend enum to DB enum
    const bookingTypeMapping: Record<string, string> = {
      'one_way': 'oneway',
      'return': 'return',
      'hourly': 'hourly',
      'daily': 'daily',
      'fleet': 'fleet'
    };

    const dbBookingType = bookingTypeMapping[trip.bookingType] || trip.bookingType;

    return {
      bookingType: dbBookingType,             // MAPPED to DB enum
      scheduledAt: trip.dateTime,              // REAL DATA from Phase 2A
      pickup: trip.pickup,                    // REAL DATA from Phase 2A
      dropoff: trip.dropoff,                  // REAL DATA from Phase 2A
      distance: trip.distance ?? null,        // REAL DATA from Phase 2A
      duration: trip.duration ?? null,        // REAL DATA from Phase 2A
      vehicleCategory: trip.vehicleType,      // REAL DATA from Phase 2A
      coordinates: trip.coordinates ?? null,   // REAL DATA from Phase 2A
      hours: trip.hours ?? null,             // REAL DATA from Phase 2A
      days: trip.days ?? null,               // REAL DATA from Phase 2A
      extras: trip.extras ?? []              // REAL DATA from Phase 2A
    };
  }

  /**
   * Create booking legs and associated leg quotes
   */
  private static async createBookingLegs(
    bookingId: string,
    tripConfig: {
      bookingType: string;
      scheduledAt: string;
      pickup: string;
      dropoff: string;
      distance: number | null;
      duration: number | null;
      vehicleCategory: string;
      coordinates: any;
      hours: number | null;
      days: number | null;
      extras: any[];
    },
    quote: any
  ): Promise<{
    success: boolean;
    legIds?: string[];
    error?: string;
  }> {
    try {
      // Phase 2B scope: single main leg only
      const { data: bookingLeg, error: legError } = await supabase
        .from('booking_legs')
        .insert({
          booking_id: bookingId,
          leg_number: 1,
          leg_kind: 'main',
          status: 'PENDING',
          pickup_address: tripConfig.pickup,
          dropoff_address: tripConfig.dropoff,
          scheduled_at: tripConfig.scheduledAt,
          vehicle_category_id: tripConfig.vehicleCategory,
          distance_miles: tripConfig.distance,
          duration_min: tripConfig.duration,
          organization_id: quote.organization_id
        })
        .select('id')
        .single();

      if (legError || !bookingLeg) {
        return {
          success: false,
          error: legError?.message || 'Failed to create booking leg'
        };
      }

      const { error: legQuoteError } = await supabase
        .from('client_leg_quotes')
        .insert({
          booking_leg_id: bookingLeg.id,
          booking_id: bookingId,
          version: 1,
          is_locked: false,
          currency: quote.currency,
          subtotal_pence: quote.subtotal_pence,
          discount_pence: quote.discount_pence,
          vat_rate: quote.vat_rate,
          vat_pence: quote.vat_pence,
          total_pence: quote.total_pence,
          line_items: quote.line_items,
          calc_source: 'pricing_engine_v2',
          calc_version: '2.0.0',
          organization_id: quote.organization_id
        });

      if (legQuoteError) {
        return {
          success: false,
          error: legQuoteError.message || 'Failed to create client leg quote'
        };
      }

      return {
        success: true,
        legIds: [bookingLeg.id]
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * DEPRECATED - NO-OP
   *
   * Update quote status - NOT IMPLEMENTED
   *
   * The column 'quote_status' does not exist in client_booking_quotes table.
   * This function is kept for backward compatibility but does nothing.
   *
   * TODO: Implement quote status tracking when schema is updated to include status column,
   * or remove this function and all its call sites if status tracking is not needed.
   */
  static async updateQuoteStatus(
    quoteId: string,
    status: 'pending' | 'accepted' | 'rejected' | 'expired'
  ): Promise<void> {
    console.warn(`⚠️  updateQuoteStatus() is deprecated (quote_status column doesn't exist). Called with quoteId=${quoteId}, status=${status}`);
    // No-op: quote_status column doesn't exist in client_booking_quotes
    return;
  }
}

/**
 * Quote to Booking Service
 * 
 * Handles Phase 2B: Converting independent quotes to bookings
 * Separated from QuoteService to reduce complexity
 */

import { supabase } from '../config/supabase';

export interface QuoteToBookingResult {
  success: boolean;
  bookingId?: string;
  quoteId?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

export class QuoteToBookingService {

  /**
   * Convert independent quote to booking (Phase 2B)
   * Uses atomic RPC function for transaction safety
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
    try {
      console.log('🎯 Phase 2B: Converting quote to booking (ATOMIC):', quoteId);

      // STEP 1: Find or create customer (source of truth pattern)
      const resolvedCustomerId = await this.findOrCreateCustomer(
        customerData.customerId,
        organizationId,
        customerData
      );

      console.log('✅ Customer resolved:', resolvedCustomerId);

      // STEP 2: Call atomic RPC function with valid customer_id
      const { data, error } = await supabase.rpc('convert_quote_to_booking_atomic', {
        p_quote_id: quoteId,
        p_organization_id: organizationId,
        p_customer_id: resolvedCustomerId,
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
      console.log('🔍 Full RPC result:', JSON.stringify(result, null, 2));

      // STEP 3: Patch vehicle_model_id on booking_legs from quote metadata
      try {
        const { data: quoteData } = await supabase
          .from('client_booking_quotes')
          .select('line_items')
          .eq('id', quoteId)
          .single();

        const vehicleModel = quoteData?.line_items?.meta?.trip?.vehicleModel;
        if (vehicleModel && result.booking_id) {
          await supabase
            .from('booking_legs')
            .update({ vehicle_model_id: vehicleModel })
            .eq('booking_id', result.booking_id);
          console.log('✅ vehicle_model_id patched on booking_legs:', vehicleModel);
        }
      } catch (modelPatchError: any) {
        console.error('⚠️  vehicle_model_id patch failed (non-blocking):', modelPatchError);
      }

      // STEP 4: Create financial snapshot for the booking
      try {
        console.log('💰 Creating financial snapshot for booking:', result.booking_id);
        const { FinancialSnapshotService } = await import('./FinancialSnapshotService');
        await FinancialSnapshotService.createFinancialSnapshot(result.booking_id, quoteId, organizationId);
        console.log('✅ Financial snapshot created successfully');
      } catch (snapshotError: any) {
        console.error('⚠️  Failed to create financial snapshot:', snapshotError);
        console.error('   Booking created successfully but snapshot creation failed');
      }

      // STEP 5: Populate booking_leg_locations from quote trip metadata (non-blocking)
      try {
        const { data: quoteForLocs } = await supabase
          .from('client_booking_quotes')
          .select('line_items')
          .eq('id', quoteId)
          .single();

        const trip = quoteForLocs?.line_items?.meta?.trip;

        // trip.pickup / trip.dropoff are objects: { address: string, coordinates: { lat, lng } }
        const pickupAddress = trip?.pickup?.address ?? null;
        const dropoffAddress = trip?.dropoff?.address ?? null;
        const pickupLat = trip?.pickup?.coordinates?.lat ?? null;
        const pickupLng = trip?.pickup?.coordinates?.lng ?? null;
        const dropoffLat = trip?.dropoff?.coordinates?.lat ?? null;
        const dropoffLng = trip?.dropoff?.coordinates?.lng ?? null;

        const { data: legs } = await supabase
          .from('booking_legs')
          .select('id, leg_number')
          .eq('booking_id', result.booking_id)
          .order('leg_number', { ascending: true });

        if (legs && legs.length > 0 && pickupAddress) {
          const locRows: any[] = [];

          for (const leg of legs) {
            const isInbound = leg.leg_number === 2;

            // Inbound leg (return): swap pickup/dropoff
            const pAddr = isInbound ? dropoffAddress : pickupAddress;
            const dAddr = isInbound ? pickupAddress : dropoffAddress;
            const pLat  = isInbound ? dropoffLat : pickupLat;
            const pLng  = isInbound ? dropoffLng : pickupLng;
            const dLat  = isInbound ? pickupLat : dropoffLat;
            const dLng  = isInbound ? pickupLng : dropoffLng;

            if (pAddr) {
              locRows.push({
                booking_leg_id: leg.id,
                organization_id: organizationId,
                location_role: 'pickup',
                sequence_no: 1,
                place_id: null,
                lat: pLat,
                lng: pLng,
                display_address: pAddr,
                full_address: pAddr,
                postcode: null,
                outcode: null,
                city: null,
                area: null,
                country: null,
                address_components: null,
                raw_place: null,
                visibility_level: 'full',
              });
            }

            if (dAddr) {
              locRows.push({
                booking_leg_id: leg.id,
                organization_id: organizationId,
                location_role: 'dropoff',
                sequence_no: 2,
                place_id: null,
                lat: dLat,
                lng: dLng,
                display_address: dAddr,
                full_address: dAddr,
                postcode: null,
                outcode: null,
                city: null,
                area: null,
                country: null,
                address_components: null,
                raw_place: null,
                visibility_level: 'full',
              });
            }
          }

          if (locRows.length > 0) {
            const { error: locErr } = await supabase.from('booking_leg_locations').insert(locRows);
            if (locErr) {
              console.error('⚠️  booking_leg_locations insert failed (non-blocking):', locErr.message);
            } else {
              console.log(`✅ booking_leg_locations populated: ${locRows.length} rows`);
            }
          }
        }
      } catch (locError: any) {
        console.error('⚠️  booking_leg_locations step failed (non-blocking):', locError.message);
      }

      // Check if RPC already returns reference and amount
      if (result.booking_reference && result.total_amount_pence) {
        console.log('✅ RPC returned complete booking data');
        return {
          success: true,
          bookingId: result.booking_id,
          quoteId: result.quote_id || quoteId,
          reference: result.booking_reference,
          amount: result.total_amount_pence,
          currency: result.currency || 'GBP'
        };
      }

      // Fallback: Fetch from correct sources
      console.log('⚠️  RPC did not return reference/amount, fetching from source tables...');

      // STEP 1: Fetch amount from quote (source of truth for pricing)
      const { data: quote, error: quoteError } = await supabase
        .from('client_booking_quotes')
        .select('total_pence, currency')
        .eq('id', quoteId)
        .single();

      if (quoteError) {
        console.error('❌ Failed to fetch quote for amount:', quoteError);
        return {
          success: false,
          error: `Failed to fetch quote pricing: ${quoteError.message}`,
          quoteId
        };
      }

      // STEP 2: Fetch reference from booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', result.booking_id)
        .single();

      if (bookingError) {
        console.error('❌ Failed to fetch booking for reference:', bookingError);
        return {
          success: false,
          error: `Failed to fetch booking details: ${bookingError.message}`,
          quoteId
        };
      }

      console.log('📋 Fetched booking columns:', Object.keys(booking || {}));

      // STEP 3: Extract fields from correct sources
      const reference = booking?.booking_reference || booking?.reference_number || booking?.reference || null;
      const amount = quote?.total_pence || null;
      const currency = quote?.currency || booking?.currency || 'GBP';

      console.log('📊 Extracted fields:', { reference, amount, currency });

      // STEP 4: Strict validation - never return success with incomplete data
      if (!reference || amount == null) {
        console.error('❌ Booking created but response is incomplete');
        console.error(`   reference: ${reference}, amount: ${amount}`);
        return {
          success: false,
          error: `Booking created but incomplete data. Missing reference=${!reference}, amount=${amount == null}`,
          quoteId
        };
      }

      return {
        success: true,
        bookingId: result.booking_id,
        quoteId: result.quote_id || quoteId,
        reference: reference,
        amount: amount,
        currency: currency
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
   * Find or create customer (source of truth pattern)
   * Backend is responsible for customer existence, not frontend
   */
  private static async findOrCreateCustomer(
    authUserId: string,
    organizationId: string,
    customerData: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    }
  ): Promise<string> {
    try {
      // Try to find existing customer by auth_user_id
      const { data: existingCustomer, error: findError } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', authUserId)
        .eq('organization_id', organizationId)
        .single();

      if (existingCustomer) {
        console.log('✅ Found existing customer:', existingCustomer.id);
        return existingCustomer.id;
      }

      // Customer doesn't exist - create it
      console.log('📝 Creating new customer for auth_user_id:', authUserId);

      const { data: newCustomer, error: createError } = await supabase
        .from('customers')
        .insert({
          auth_user_id: authUserId,
          organization_id: organizationId,
          email: customerData.email || null,
          first_name: customerData.firstName || null,
          last_name: customerData.lastName || null,
          phone: customerData.phone || null,
          customer_type: 'individual',
          status: 'active'
        })
        .select('id')
        .single();

      if (createError) {
        console.error('❌ Failed to create customer:', createError);
        throw new Error(`Failed to create customer: ${createError.message}`);
      }

      console.log('✅ Created new customer:', newCustomer.id);
      return newCustomer.id;

    } catch (error: any) {
      console.error('❌ Error in findOrCreateCustomer:', error);
      throw error;
    }
  }

  /**
   * Extract trip configuration from quote metadata
   * Used by RPC to create booking from quote
   */
  static extractTripConfigurationFromQuote(quote: any): {
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
      bookingType: dbBookingType,
      scheduledAt: trip.dateTime,
      pickup: trip.pickup,
      dropoff: trip.dropoff,
      distance: trip.distance ?? null,
      duration: trip.duration ?? null,
      vehicleCategory: trip.vehicleType,
      coordinates: trip.coordinates ?? null,
      hours: trip.hours ?? null,
      days: trip.days ?? null,
      extras: trip.extras ?? []
    };
  }
}

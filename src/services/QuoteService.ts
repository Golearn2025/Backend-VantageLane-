/**
 * Quote Service
 * 
 * Handles persistence of pricing quotes to database:
 * 1. Create leg quotes (client_leg_quotes)
 * 2. Create booking quote (client_booking_quotes)
 */

import { supabase } from '../config/supabase';
import { PricingResult, LegBreakdown } from '../types/pricing.types';

export interface QuoteCreationResult {
  booking_quote_id: string;
  leg_quote_ids: string[];
  success: boolean;
  error?: string;
}

export class QuoteService {
  
  /**
   * Create complete quote (legs + booking)
   * This is called after pricing calculation
   * 
   * NOTE: booking_id is optional. If not provided, quote is created without FK constraint
   * (useful for price estimation before booking creation)
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
          base_fare: leg.pricing?.baseFare || 0,
          distance_fee: leg.pricing?.distanceFee || 0,
          time_fee: leg.pricing?.timeFee || 0,
          airport_fees: leg.pricing?.airportFees || 0,
          zone_fees: leg.pricing?.zoneFees || 0,
          toll_fees: leg.pricing?.tollFees || 0,
          extra_services: leg.pricing?.extraServices || 0
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
    
    const { data, error } = await supabase
      .from('client_booking_quotes')
      .insert({
        booking_id: bookingId,
        organization_id: organizationId,
        version: 1,
        is_locked: false,
        quote_valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        currency: pricingResult.currency || 'GBP',
        
        // Required pricing fields
        subtotal_pence: subtotalPence,
        discount_pence: discountPence,
        vat_rate: vatRate,
        vat_pence: vatPence,
        total_pence: totalPence,
        
        // Line items as JSONB
        line_items: {
          base_fare: pricingResult.breakdown?.baseFare || 0,
          distance_fee: pricingResult.breakdown?.distanceFee || 0,
          time_fee: pricingResult.breakdown?.timeFee || 0,
          additional_fees: pricingResult.breakdown?.additionalFees || 0,
          services: pricingResult.breakdown?.services || 0,
          multipliers: pricingResult.breakdown?.multipliers || {},
          discounts: pricingResult.breakdown?.discounts || 0
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
   * Update quote status
   */
  static async updateQuoteStatus(
    quoteId: string,
    status: 'pending' | 'accepted' | 'rejected' | 'expired'
  ): Promise<void> {
    const { error } = await supabase
      .from('client_booking_quotes')
      .update({ quote_status: status })
      .eq('id', quoteId);

    if (error) {
      throw new Error(`Failed to update quote status: ${error.message}`);
    }
  }
}

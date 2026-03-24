/**
 * Quote Read Service
 * 
 * Handles ONLY reading/fetching quotes from database
 */

import { supabase } from '../../config/supabase';

export class QuoteReadService {
  
  /**
   * Get quote by ID with leg quotes
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
   * Get quote by booking ID
   */
  static async getQuoteByBookingId(bookingId: string): Promise<any> {
    const { data, error } = await supabase
      .from('client_booking_quotes')
      .select(`
        *,
        leg_quotes:client_leg_quotes(*)
      `)
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      throw new Error(`Failed to fetch quote by booking ID: ${error.message}`);
    }

    return data;
  }
}

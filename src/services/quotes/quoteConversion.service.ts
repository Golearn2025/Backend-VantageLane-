/**
 * Quote Conversion Service
 * 
 * Handles ONLY quote → booking conversion logic
 * Uses atomic RPC for guaranteed consistency
 */

import { supabase } from '../../config/supabase';

export interface ConversionResult {
  success: boolean;
  bookingId?: string;
  quoteId?: string;
  error?: string;
}

export class QuoteConversionService {
  
  /**
   * Convert independent quote to booking (ATOMIC via RPC)
   * 
   * CRITICAL NOTES:
   * - Uses atomic PostgreSQL RPC for guaranteed consistency
   * - All operations succeed or fail together
   * - Enforces tenant ownership with organizationId validation
   * - Reads ONLY from persisted Phase 2A metadata (no invented data)
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
  ): Promise<ConversionResult> {
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
}

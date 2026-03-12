/**
 * Financial Snapshot Service
 * 
 * Creates financial snapshots when a booking is confirmed:
 * 1. Generate line items (booking_line_items)
 * 2. Create leg financial snapshots (internal_leg_financials)
 * 3. Create booking financial snapshot (internal_booking_financials)
 * 
 * These snapshots are immutable records for accounting and driver payouts
 */

import { supabase } from '../config/supabase';
import { OrganizationSettingsService } from './OrganizationSettingsService';

export interface FinancialSnapshotResult {
  booking_financial_id: string;
  leg_financial_ids: string[];
  line_item_ids: string[];
  success: boolean;
  error?: string;
}

export class FinancialSnapshotService {
  
  /**
   * Create complete financial snapshot on booking confirmation
   * This locks in the pricing and commission structure
   */
  static async createFinancialSnapshot(
    bookingId: string,
    quoteId: string,
    organizationId: string
  ): Promise<FinancialSnapshotResult> {
    try {
      // Fetch the quote
      const quote = await this.getQuote(quoteId);
      if (!quote) {
        throw new Error('Quote not found');
      }

      // Get organization settings (commission rates, VAT)
      const settings = await OrganizationSettingsService.getOrganizationSettings(organizationId);

      // Step 1: Create line items
      const lineItemIds = await this.createLineItems(bookingId, quote, settings);

      // Step 2: Create leg financial snapshots
      const legFinancialIds: string[] = [];
      if (quote.leg_quotes && quote.leg_quotes.length > 0) {
        for (const legQuote of quote.leg_quotes) {
          const legFinancialId = await this.createLegFinancial(
            bookingId,
            legQuote,
            settings
          );
          legFinancialIds.push(legFinancialId);
        }
      }

      // Step 3: Create booking financial snapshot
      const bookingFinancialId = await this.createBookingFinancial(
        bookingId,
        quote,
        legFinancialIds,
        settings
      );

      return {
        booking_financial_id: bookingFinancialId,
        leg_financial_ids: legFinancialIds,
        line_item_ids: lineItemIds,
        success: true
      };

    } catch (error: any) {
      console.error('Error creating financial snapshot:', error);
      return {
        booking_financial_id: '',
        leg_financial_ids: [],
        line_item_ids: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create line items for the booking
   * Line items break down the price into individual components
   */
  private static async createLineItems(
    bookingId: string,
    quote: any,
    settings: any
  ): Promise<string[]> {
    const lineItems = [];
    const lineItemIds: string[] = [];

    // Base fare
    if (quote.base_fare_pence > 0) {
      lineItems.push({
        booking_id: bookingId,
        item_type: 'base_fare',
        description: 'Base fare',
        amount_pence: quote.base_fare_pence,
        quantity: 1,
        is_taxable: true
      });
    }

    // Distance fee
    if (quote.distance_fee_pence > 0) {
      lineItems.push({
        booking_id: bookingId,
        item_type: 'distance_fee',
        description: `Distance fee (${quote.distance_km} km)`,
        amount_pence: quote.distance_fee_pence,
        quantity: 1,
        is_taxable: true
      });
    }

    // Time fee
    if (quote.time_fee_pence > 0) {
      lineItems.push({
        booking_id: bookingId,
        item_type: 'time_fee',
        description: `Time fee (${quote.duration_min} min)`,
        amount_pence: quote.time_fee_pence,
        quantity: 1,
        is_taxable: true
      });
    }

    // Additional fees (airports, zones, tolls)
    if (quote.additional_fees_pence > 0) {
      lineItems.push({
        booking_id: bookingId,
        item_type: 'additional_fees',
        description: 'Airport/Zone/Toll fees',
        amount_pence: quote.additional_fees_pence,
        quantity: 1,
        is_taxable: true
      });
    }

    // Services (multi-stop, extras)
    if (quote.services_pence > 0) {
      lineItems.push({
        booking_id: bookingId,
        item_type: 'services',
        description: 'Additional services',
        amount_pence: quote.services_pence,
        quantity: 1,
        is_taxable: true
      });
    }

    // Discounts
    if (quote.discounts_pence > 0) {
      lineItems.push({
        booking_id: bookingId,
        item_type: 'discount',
        description: 'Discount applied',
        amount_pence: -quote.discounts_pence,
        quantity: 1,
        is_taxable: false
      });
    }

    // VAT
    const subtotalBeforeVAT = quote.final_price_pence;
    const vatAmount = Math.round(subtotalBeforeVAT * settings.vat_rate);
    
    lineItems.push({
      booking_id: bookingId,
      item_type: 'vat',
      description: `VAT (${(settings.vat_rate * 100).toFixed(0)}%)`,
      amount_pence: vatAmount,
      quantity: 1,
      is_taxable: false
    });

    // Insert all line items
    if (lineItems.length > 0) {
      const { data, error } = await supabase
        .from('booking_line_items')
        .insert(lineItems)
        .select('id');

      if (error) {
        throw new Error(`Failed to create line items: ${error.message}`);
      }

      lineItemIds.push(...data.map(item => item.id));
    }

    return lineItemIds;
  }

  /**
   * Create leg financial snapshot
   */
  private static async createLegFinancial(
    bookingId: string,
    legQuote: any,
    settings: any
  ): Promise<string> {
    // Calculate VAT
    const priceBeforeVAT = legQuote.leg_price_pence;
    const vatAmount = Math.round(priceBeforeVAT * settings.vat_rate);
    const priceWithVAT = priceBeforeVAT + vatAmount;

    // Calculate commissions
    const platformFee = Math.round(priceBeforeVAT * settings.platform_commission_pct);
    const operatorNet = priceBeforeVAT - platformFee;
    const operatorCommission = Math.round(operatorNet * settings.operator_commission_pct);
    const driverPayout = operatorNet - operatorCommission;

    const { data, error } = await supabase
      .from('internal_leg_financials')
      .insert({
        booking_id: bookingId,
        leg_quote_id: legQuote.id,
        leg_number: legQuote.leg_number,
        leg_type: legQuote.leg_type,
        
        // Pricing snapshot (pence)
        customer_price_pence: priceWithVAT,
        price_before_vat_pence: priceBeforeVAT,
        vat_amount_pence: vatAmount,
        vat_rate: settings.vat_rate,
        
        // Commission breakdown (pence)
        platform_fee_pence: platformFee,
        platform_commission_pct: settings.platform_commission_pct,
        operator_net_pence: operatorNet,
        operator_commission_pence: operatorCommission,
        operator_commission_pct: settings.operator_commission_pct,
        driver_payout_pence: driverPayout,
        
        currency: 'GBP',
        snapshot_created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create leg financial: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Create booking financial snapshot (aggregated)
   */
  private static async createBookingFinancial(
    bookingId: string,
    quote: any,
    legFinancialIds: string[],
    settings: any
  ): Promise<string> {
    // Calculate VAT
    const priceBeforeVAT = quote.final_price_pence;
    const vatAmount = Math.round(priceBeforeVAT * settings.vat_rate);
    const priceWithVAT = priceBeforeVAT + vatAmount;

    // Calculate commissions
    const platformFee = Math.round(priceBeforeVAT * settings.platform_commission_pct);
    const operatorNet = priceBeforeVAT - platformFee;
    const operatorCommission = Math.round(operatorNet * settings.operator_commission_pct);
    const driverPayout = operatorNet - operatorCommission;

    const { data, error } = await supabase
      .from('internal_booking_financials')
      .insert({
        booking_id: bookingId,
        booking_quote_id: quote.id,
        pricing_version_id: quote.pricing_version_id || null,
        
        // Pricing snapshot (pence)
        customer_price_pence: priceWithVAT,
        price_before_vat_pence: priceBeforeVAT,
        vat_amount_pence: vatAmount,
        vat_rate: settings.vat_rate,
        
        // Commission breakdown (pence)
        platform_fee_pence: platformFee,
        platform_commission_pct: settings.platform_commission_pct,
        operator_net_pence: operatorNet,
        operator_commission_pence: operatorCommission,
        operator_commission_pct: settings.operator_commission_pct,
        driver_payout_pence: driverPayout,
        
        // Link to leg financials
        leg_financial_ids: legFinancialIds,
        
        currency: 'GBP',
        snapshot_created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create booking financial: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Get quote from database
   */
  private static async getQuote(quoteId: string): Promise<any> {
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
   * Get financial snapshot for a booking
   */
  static async getBookingFinancials(bookingId: string): Promise<any> {
    const { data, error } = await supabase
      .from('internal_booking_financials')
      .select(`
        *,
        leg_financials:internal_leg_financials(*)
      `)
      .eq('booking_id', bookingId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch booking financials: ${error.message}`);
    }

    return data;
  }
}

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

      // Step 1: Line items (DEPRECATED - no longer writing pricing breakdown to booking_line_items)
      const lineItemIds: string[] = [];

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
   * DEPRECATED - DO NOT USE
   *
   * This function is no longer called. Pricing breakdown is now stored in:
   * - client_booking_quotes.line_items (JSONB with components[], discounts[], multipliers[])
   * - client_leg_quotes.line_items (JSONB with components[], discounts[], multipliers[])
   *
   * booking_line_items table should only be used for actual service items/catalog,
   * NOT for pricing components like base_fare, distance_fee, etc.
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
    // Calculate from quote fields (aligned with schema)
    const subtotalPence = legQuote.subtotal_pence || 0;
    const discountPence = legQuote.discount_pence || 0;
    const vatAmount = legQuote.vat_pence || 0;
    const totalPence = legQuote.total_pence || 0;

    // Price before VAT = subtotal - discount
    const subtotalExVatPence = subtotalPence - discountPence;

    // Calculate commissions (from subtotal ex VAT)
    const platformFeePence = Math.round(subtotalExVatPence * settings.platform_commission_pct);
    const operatorFeePence = Math.round((subtotalExVatPence - platformFeePence) * settings.operator_commission_pct);
    const driverPayoutPence = subtotalExVatPence - platformFeePence - operatorFeePence;
    const vendorCostPence = driverPayoutPence; // Driver payout is main operational cost

    // Build line_items JSONB snapshot
    const lineItems = {
      source: 'quote_snapshot',
      quote_id: legQuote.id,
      pricing: {
        subtotal_pence: subtotalPence,
        discount_pence: discountPence,
        vat_pence: vatAmount,
        total_pence: totalPence
      },
      components: legQuote.line_items?.components || [],
      commissions: {
        platform_fee_pence: platformFeePence,
        operator_fee_pence: operatorFeePence,
        driver_payout_pence: driverPayoutPence
      }
    };

    const { data, error } = await supabase
      .from('internal_leg_financials')
      .insert({
        booking_leg_id: legQuote.booking_leg_id || null,
        booking_id: bookingId,
        version: 1,
        currency: 'GBP',
        driver_payout_pence: driverPayoutPence,
        platform_fee_pence: platformFeePence,
        vendor_cost_pence: vendorCostPence,
        line_items: lineItems,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
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
    // Calculate from quote fields (aligned with schema)
    const subtotalPence = quote.subtotal_pence || 0;
    const discountPence = quote.discount_pence || 0;
    const vatAmountPence = quote.vat_pence || 0;
    const grossAmountPence = quote.total_pence || 0;

    // Subtotal ex VAT = subtotal - discount
    const subtotalExVatPence = subtotalPence - discountPence;

    // Calculate commissions (from subtotal ex VAT)
    const platformFeePence = Math.round(subtotalExVatPence * settings.platform_commission_pct);
    const operatorFeePence = Math.round((subtotalExVatPence - platformFeePence) * settings.operator_commission_pct);
    const driverPayoutPence = subtotalExVatPence - platformFeePence - operatorFeePence;

    // Calculate driver base vs extras payout split
    const vehicleSubtotalPence = quote.vehicle_subtotal_pence || 0;
    const vehicleDiscountPence = quote.vehicle_discount_pence || 0;
    const servicesSubtotalPence = quote.services_subtotal_pence || 0;

    const vehicleNetPence = vehicleSubtotalPence - vehicleDiscountPence;

    // Driver base payout = (vehicle net) - fees on vehicle portion
    const platformFeeOnVehicle = Math.round(vehicleNetPence * settings.platform_commission_pct);
    const operatorFeeOnVehicle = Math.round((vehicleNetPence - platformFeeOnVehicle) * settings.operator_commission_pct);
    const driverBasePayoutPence = vehicleNetPence - platformFeeOnVehicle - operatorFeeOnVehicle;

    // Driver extras payout from service_item_payout_rules
    let driverExtrasPayoutPence = 0;

    // Extract service items from quote line_items
    const serviceItems = quote.line_items?.components?.filter((c: any) => c.code === 'service_item') || [];

    for (const item of serviceItems) {
      try {
        const { PricingDataService } = await import('./PricingDataService');
        const payoutRules = await PricingDataService.getServiceItemPayoutRules(
          item.service_item_id || item.label,
          quote.organization_id
        );

        for (const rule of payoutRules) {
          if (rule.recipient_type === 'driver') {
            if (rule.payout_mode === 'fixed') {
              driverExtrasPayoutPence += rule.payout_value;
            } else if (rule.payout_mode === 'percentage') {
              const itemPricePence = item.amount_pence || 0;
              driverExtrasPayoutPence += Math.round(itemPricePence * (rule.payout_value / 10000));
            }
          }
        }
      } catch (error) {
        console.error('Failed to load payout rules for service item:', error);
      }
    }

    // Fee rates in basis points (1% = 100 bp)
    const platformFeeRateBp = Math.round(settings.platform_commission_pct * 10000);
    const operatorFeeRateBp = Math.round(settings.operator_commission_pct * 10000);

    // Vendor cost = driver payout (main operational cost)
    const vendorCostPence = driverPayoutPence;

    // Platform profit = platform fee (simplified for now)
    const platformProfitPence = platformFeePence;

    // Temporary values (until payment integration complete)
    const processorFeePence = 0; // No processor fee yet
    const netCollectedPence = grossAmountPence; // Full amount collected
    const netToPlatformPence = platformFeePence;
    const netToOperatorPence = operatorFeePence;
    const netToDriverPence = driverPayoutPence;

    // Build line_items JSONB snapshot
    const lineItems = {
      source: 'quote_snapshot',
      quote_id: quote.id,
      summary: {
        subtotal_pence: subtotalPence,
        discount_pence: discountPence,
        vat_pence: vatAmountPence,
        gross_amount_pence: grossAmountPence,
        subtotal_ex_vat_pence: subtotalExVatPence
      },
      components: quote.line_items?.components || [],
      discounts: quote.line_items?.discounts || [],
      multipliers: quote.line_items?.multipliers || [],
      commissions: {
        platform_fee_pence: platformFeePence,
        operator_fee_pence: operatorFeePence,
        driver_payout_pence: driverPayoutPence,
        platform_fee_rate_bp: platformFeeRateBp,
        operator_fee_rate_bp: operatorFeeRateBp
      },
      leg_financial_ids: legFinancialIds
    };

    const { data, error } = await supabase
      .from('internal_booking_financials')
      .insert({
        booking_id: bookingId,
        quote_id: quote.id,
        pricing_version_id: quote.pricing_version_id || null,
        version: 1,
        currency: 'GBP',

        // Pricing fields (aligned with schema)
        gross_amount_pence: grossAmountPence,
        vat_amount_pence: vatAmountPence,
        subtotal_ex_vat_pence: subtotalExVatPence,

        // Fee rates (basis points)
        platform_fee_rate_bp: platformFeeRateBp,
        operator_fee_rate_bp: operatorFeeRateBp,

        // Fee amounts (pence)
        platform_fee_pence: platformFeePence,
        operator_fee_pence: operatorFeePence,
        driver_payout_pence: driverPayoutPence,
        driver_base_payout_pence: driverBasePayoutPence,
        driver_extras_payout_pence: driverExtrasPayoutPence,
        vendor_cost_pence: vendorCostPence,
        platform_profit_pence: platformProfitPence,
        processor_fee_pence: processorFeePence,

        // Net amounts (pence)
        net_collected_pence: netCollectedPence,
        net_to_platform_pence: netToPlatformPence,
        net_to_operator_pence: netToOperatorPence,
        net_to_driver_pence: netToDriverPence,

        // Payment linkage (temporary null until payment integration)
        booking_payment_id: null,

        // Metadata
        pricing_source: 'quote_snapshot',
        calculated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),

        // Line items JSONB
        line_items: lineItems
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
   * Uses separate queries to avoid embedded relation dependency
   */
  private static async getQuote(quoteId: string): Promise<any> {
    // 1. Get booking quote
    const { data: quote, error: quoteError } = await supabase
      .from('client_booking_quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (quoteError) {
      throw new Error(`Failed to fetch quote: ${quoteError.message}`);
    }

    // 2. Get leg quotes separately by booking_id (NOT booking_quote_id - column doesn't exist)
    const { data: legQuotes, error: legError } = await supabase
      .from('client_leg_quotes')
      .select('*')
      .eq('booking_id', quote.booking_id);

    // Ignore error if leg quotes don't exist (optional relationship)
    if (legError) {
      console.warn(`No leg quotes found for booking ${quote.booking_id}: ${legError.message}`);
    }

    // 3. Attach leg_quotes manually
    return {
      ...quote,
      leg_quotes: legQuotes || []
    };
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

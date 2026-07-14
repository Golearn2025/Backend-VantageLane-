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
import { OrganizationFinancialSettingsService } from './OrganizationFinancialSettingsService';
import { PartnerRevenueShareService } from './PartnerRevenueShareService';

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

      // Step 1: Catalog paid upgrades → booking_line_items (service_items snapshot)
      let lineItemIds: string[] = [];
      try {
        const { BookingCatalogLineItemsService } = await import('./BookingCatalogLineItemsService');
        lineItemIds = await BookingCatalogLineItemsService.persistPaidUpgradesFromQuote(
          bookingId,
          quote,
          organizationId
        );
      } catch (catalogLineError: any) {
        console.error(
          '⚠️  Failed to persist catalog line items (paid upgrades):',
          catalogLineError?.message || catalogLineError
        );
      }

      // Step 2: Create leg financial snapshots
      const legFinancialIds: string[] = [];
      if (quote.leg_quotes && quote.leg_quotes.length > 0) {
        // Fetch vehicle_category_ids from booking_legs for guardrail lookup
        const { data: bookingLegs } = await supabase
          .from('booking_legs')
          .select('id, vehicle_category_id')
          .eq('booking_id', bookingId);

        // Create map for leg_id -> vehicle_category_id lookup
        const legVehicleMap = new Map(
          bookingLegs?.map(l => [l.id, l.vehicle_category_id]) || []
        );

        for (const legQuote of quote.leg_quotes) {
          const legId = legQuote.booking_leg_id;
          const vehicleCategoryId = legVehicleMap.get(legId) || null;

          const legFinancialId = await this.createLegFinancial(
            bookingId,
            legQuote,
            settings,
            quote.pricing_version_id || null,
            vehicleCategoryId,
            quote.booking_type || null,
            organizationId
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
   * Calculate driver payout with factor and guardrails
   * Shared logic between leg-level and booking-level
   */
  private static async calculateDriverPayoutWithGuardrails(
    basePayoutPence: number,
    pricingVersionId: string | null,
    vehicleCategoryId: string | null,
    bookingType: string | null,
    organizationId: string
  ): Promise<{
    targetPayout: number;
    finalPayout: number;
    factorUsed: number | null;
    minGuardrail: number | null;
    maxGuardrail: number | null;
  }> {
    // Fallback: return base if no pricing version
    if (!pricingVersionId || basePayoutPence <= 0) {
      return {
        targetPayout: basePayoutPence,
        finalPayout: basePayoutPence,
        factorUsed: null,
        minGuardrail: null,
        maxGuardrail: null
      };
    }

    try {
      const { PricingDataService } = await import('./PricingDataService');
      const config = await PricingDataService.getDriverPricingConfig(pricingVersionId);

      if (!config) {
        console.warn(`⚠️ Pricing config not found for version ${pricingVersionId}, using fallback`);
        return {
          targetPayout: basePayoutPence,
          finalPayout: basePayoutPence,
          factorUsed: null,
          minGuardrail: null,
          maxGuardrail: null
        };
      }

      // Fetch vehicle-specific rates if available
      let vehicleMinPayout: number | null = null;
      let vehicleMaxPayout: number | null = null;

      if (vehicleCategoryId && bookingType) {
        try {
          const vehicleRates = await PricingDataService.getVehicleRates(
            vehicleCategoryId,
            bookingType,
            organizationId
          );
          vehicleMinPayout = vehicleRates.driver_min_payout_pence ?? null;
          vehicleMaxPayout = vehicleRates.driver_max_payout_pence ?? null;
        } catch (error) {
          console.warn(`⚠️ Could not fetch vehicle rates for ${vehicleCategoryId}, using global guardrails`);
        }
      }

      // Calculate target with factor
      const rawTargetPayout = Math.round(basePayoutPence * config.factor);
      let finalPayout = rawTargetPayout;

      // Apply guardrails (vehicle-specific or global)
      const minPayout = vehicleMinPayout ?? config.minPayoutPence;
      const maxPayout = vehicleMaxPayout ?? config.maxPayoutPence;
      const guardrailSource = vehicleMinPayout !== null ? 'vehicle-specific' : 'global';

      if (minPayout !== null && finalPayout < minPayout) {
        finalPayout = minPayout;
        console.log(`⚠️ Driver payout clamped to min (${guardrailSource}): ${rawTargetPayout}p → ${finalPayout}p`);
      }

      if (maxPayout !== null && finalPayout > maxPayout) {
        finalPayout = maxPayout;
        console.log(`⚠️ Driver payout clamped to max (${guardrailSource}): ${rawTargetPayout}p → ${finalPayout}p`);
      }

      console.log(`💰 Driver payout: ${basePayoutPence}p × ${config.factor} = ${rawTargetPayout}p → ${finalPayout}p (after guardrails)`);

      return {
        targetPayout: rawTargetPayout,
        finalPayout: finalPayout,
        factorUsed: config.factor,
        minGuardrail: minPayout,
        maxGuardrail: maxPayout
      };
    } catch (error) {
      console.error('❌ Error calculating driver payout with guardrails:', error);
      return {
        targetPayout: basePayoutPence,
        finalPayout: basePayoutPence,
        factorUsed: null,
        minGuardrail: null,
        maxGuardrail: null
      };
    }
  }

  /**
   * Create leg financial snapshot
   */
  private static async createLegFinancial(
    bookingId: string,
    legQuote: any,
    settings: any,
    pricingVersionId: string | null,
    vehicleCategoryId: string | null,
    bookingType: string | null,
    organizationId: string
  ): Promise<string> {
    // Calculate from quote fields (aligned with schema)
    const subtotalPence = legQuote.subtotal_pence || 0;
    const discountPence = legQuote.discount_pence || 0;
    const vatAmount = legQuote.vat_pence || 0;
    const totalPence = legQuote.total_pence || 0;

    // Price before VAT = subtotal - discount
    const subtotalExVatPence = subtotalPence - discountPence;

    // Service item fees (flowers, champagne, security escort) are paid by the client for the
    // actual item. The driver gets a SEPARATE flat bonus via service_item_payout_rules.
    // Exclude them from the base payout calculation to avoid double-counting.
    const serviceItemFeesPence = (legQuote.line_items?.components || [])
      .filter((c: any) => c.code === 'service_item_fees')
      .reduce((sum: number, c: any) => sum + (c.amount_pence || 0), 0);

    // Calculate commissions on transport fare only (excluding service item fees)
    const tripOnlySubtotalExVat = subtotalExVatPence - serviceItemFeesPence;
    const platformFeePence = Math.round(tripOnlySubtotalExVat * settings.platform_commission_pct);
    const operatorFeePence = Math.round((tripOnlySubtotalExVat - platformFeePence) * settings.operator_commission_pct);

    // Driver base payout from transport fare only (before factor and guardrails)
    const driverBasePayoutPence = tripOnlySubtotalExVat - platformFeePence - operatorFeePence;

    // Apply pricing factor and guardrails (NEW - aligns with booking-level)
    const payoutCalc = await this.calculateDriverPayoutWithGuardrails(
      driverBasePayoutPence,
      pricingVersionId,
      vehicleCategoryId,
      bookingType,
      organizationId
    );

    const driverPayoutPence = payoutCalc.finalPayout;
    const vendorCostPence = driverPayoutPence; // Driver payout is main operational cost

    // Build line_items JSONB snapshot
    const lineItems = {
      source: 'quote_snapshot',
      quote_id: legQuote.id,
      pricing_version_id: pricingVersionId,
      vehicle_category_id: vehicleCategoryId,
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
        driver_payout_pence: driverPayoutPence,
        driver_base_payout_pence: driverBasePayoutPence,
        driver_target_payout_pence: payoutCalc.targetPayout,
        driver_pricing_factor: payoutCalc.factorUsed,
        percentage_min_payout: payoutCalc.minGuardrail,
        percentage_max_payout: payoutCalc.maxGuardrail,
        guardrail_applied: payoutCalc.factorUsed !== null,
        // Audit fields: show exactly what was excluded
        service_item_fees_pence: serviceItemFeesPence,
        trip_only_subtotal_ex_vat_pence: tripOnlySubtotalExVat
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
        operator_fee_pence: operatorFeePence,
        vendor_cost_pence: vendorCostPence,
        // NEW: Driver payout model columns (aligns with booking-level)
        driver_base_payout_pence: driverBasePayoutPence,
        driver_target_payout_pence: payoutCalc.targetPayout,
        driver_final_payout_pence: payoutCalc.finalPayout,
        driver_pricing_factor_used: payoutCalc.factorUsed,
        driver_estimated_payout_pence: driverBasePayoutPence,
        pricing_version_id: pricingVersionId,
        vehicle_category_id: vehicleCategoryId,
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

    // NEW COLUMNS - Phase 5 Implementation

    // driver_estimated_payout_pence: Baseline driver route price from pricing logic
    // This is the BASELINE for optimization, NOT internal operating cost
    const driverEstimatedPayoutPence = driverBasePayoutPence + driverExtrasPayoutPence;
    console.log(`💰 Driver estimated payout (baseline): ${driverBasePayoutPence}p (base) + ${driverExtrasPayoutPence}p (extras) = ${driverEstimatedPayoutPence}p`);

    // driver_estimated_cost_pence: Driver's internal operational cost estimate (analytical only)
    // Uses structured route metrics from quote (total_distance_miles, total_duration_minutes)
    // This is kept SEPARATE for analytics, NOT used for payout calculation
    let driverEstimatedCostPence: number | null = null;

    const totalDistanceMiles = quote.total_distance_miles || 0;
    const totalDurationMin = quote.total_duration_minutes || 0;

    if (totalDistanceMiles > 0 || totalDurationMin > 0) {
      const COST_PER_MILE_PENCE = 30;  // £0.30/mile (fuel + vehicle wear)
      const COST_PER_MINUTE_PENCE = 5; // £0.05/min (time cost)

      driverEstimatedCostPence = Math.round(
        (totalDistanceMiles * COST_PER_MILE_PENCE) +
        (totalDurationMin * COST_PER_MINUTE_PENCE)
      );

      console.log(`� Driver estimated cost (analytics): ${totalDistanceMiles}mi × ${COST_PER_MILE_PENCE}p + ${totalDurationMin}min × ${COST_PER_MINUTE_PENCE}p = ${driverEstimatedCostPence}p`);
    }

    // driver_target_payout_pence: Calculated target payout using versioned pricing factor
    // SOURCE OF TRUTH for driver target payout
    let driverTargetPayoutPence: number;
    let driverPricingFactorUsed: number | null = null;

    if (quote.pricing_version_id && driverEstimatedPayoutPence > 0) {
      const { PricingDataService } = await import('./PricingDataService');
      const config = await PricingDataService.getDriverPricingConfig(quote.pricing_version_id);

      if (config !== null) {
        let vehicleMinPayout: number | null = null;
        let vehicleMaxPayout: number | null = null;

        // Fetch vehicle_category_id from booking_legs (source of truth)
        try {
          const { data: bookingLeg } = await supabase
            .from('booking_legs')
            .select('vehicle_category_id')
            .eq('booking_id', bookingId)
            .limit(1)
            .single();

          const vehicleCategoryId = bookingLeg?.vehicle_category_id;

          if (vehicleCategoryId && quote.booking_type) {
            const vehicleRates = await PricingDataService.getVehicleRates(
              vehicleCategoryId,
              quote.booking_type,
              quote.organization_id
            );
            vehicleMinPayout = vehicleRates.driver_min_payout_pence ?? null;
            vehicleMaxPayout = vehicleRates.driver_max_payout_pence ?? null;
          }
        } catch (error) {
          console.warn('⚠️ Could not fetch vehicle rates for guardrails, using global only');
        }

        const minPayoutPence = vehicleMinPayout ?? config.minPayoutPence;
        const maxPayoutPence = vehicleMaxPayout ?? config.maxPayoutPence;

        let rawTargetPayout = Math.round(driverEstimatedPayoutPence * config.factor);
        let targetPayout = rawTargetPayout;

        if (minPayoutPence !== null && targetPayout < minPayoutPence) {
          targetPayout = minPayoutPence;
          const source = vehicleMinPayout !== null ? 'vehicle-specific' : 'global';
          console.log(`⚠️ Driver payout clamped to min (${source}): ${rawTargetPayout}p → ${targetPayout}p`);
        }

        if (maxPayoutPence !== null && targetPayout > maxPayoutPence) {
          targetPayout = maxPayoutPence;
          const source = vehicleMaxPayout !== null ? 'vehicle-specific' : 'global';
          console.log(`⚠️ Driver payout clamped to max (${source}): ${rawTargetPayout}p → ${targetPayout}p`);
        }

        driverTargetPayoutPence = targetPayout;
        driverPricingFactorUsed = config.factor;

        console.log(`💰 Driver target payout: ${driverEstimatedPayoutPence}p × ${config.factor} = ${rawTargetPayout}p → ${targetPayout}p (after guardrails)`);
      } else {
        driverTargetPayoutPence = driverPayoutPence;
        console.warn('⚠️ Pricing version config not found, using fallback calculation');
      }
    } else {
      driverTargetPayoutPence = driverPayoutPence;
      if (!quote.pricing_version_id) {
        console.warn('⚠️ No pricing_version_id, using fallback calculation');
      }
      if (!driverEstimatedPayoutPence || driverEstimatedPayoutPence <= 0) {
        console.warn('⚠️ No driver_estimated_payout_pence, using fallback calculation');
      }
    }

    // gross_margin_pence: Business gross margin before costs
    // Official formula: subtotal_ex_vat_pence - vendor_cost_pence
    const vendorCostPence = driverTargetPayoutPence; // Current model: vendor = driver
    const grossMarginPence = subtotalExVatPence - vendorCostPence;

    const financialSettings =
      await OrganizationFinancialSettingsService.getOrganizationFinancialSettings(
        quote.organization_id
      );
    const processorFeeEstimate =
      Math.round(grossAmountPence * financialSettings.processor_fee_pct) +
      financialSettings.processor_fixed_fee_pence;

    const economicsFromQuote = quote.line_items?.meta?.economics_snapshot;
    const vehicleCategoryId =
      economicsFromQuote?.vehicle_category ??
      quote.line_items?.meta?.legs?.[0]?.vehicle_category ??
      null;
    const bookingType = quote.booking_type ?? economicsFromQuote?.booking_type ?? 'oneway';

    const partnerShare = await PartnerRevenueShareService.calculate({
      organizationId: quote.organization_id,
      clientNetPence: subtotalExVatPence,
      clientGrossPence: grossAmountPence,
      processorFeePence: processorFeeEstimate,
      platformFeePence,
      vehicleCategoryId: vehicleCategoryId != null ? String(vehicleCategoryId) : null,
      scheduledAt: quote.line_items?.meta?.legs?.[0]?.scheduled_at ?? null,
      bookingType: String(bookingType),
      includeCurrentBookingInTierCount: true,
    });

    // net_margin_pence: Business net margin after processor fee
    // NULL until payment processed (processor_fee_pence not known yet)
    const netMarginPence: number | null = null;

    // LEGACY COLUMNS - Backward Compatibility

    // Platform profit = platform fee (keep existing logic for compatibility)
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
        driver_base_payout_pence: driverBasePayoutPence,
        driver_extras_payout_pence: driverExtrasPayoutPence,
        processor_fee_pence: processorFeePence,

        // NEW COLUMNS - Phase 5
        driver_target_payout_pence: driverTargetPayoutPence,
        driver_final_payout_pence: null,
        driver_estimated_payout_pence: driverEstimatedPayoutPence,
        driver_estimated_cost_pence: driverEstimatedCostPence,
        driver_pricing_factor_used: driverPricingFactorUsed,
        gross_margin_pence: grossMarginPence,
        net_margin_pence: netMarginPence,

        organization_id: quote.organization_id,
        estimated_driver_marketplace_pence: partnerShare.estimatedDriverMarketplacePence,
        contribution_margin_pence: partnerShare.contributionMarginPence,
        partner_share_pence: partnerShare.partnerSharePence,
        partner_share_rate_bp: partnerShare.partnerShareRateBp,
        partner_tier_booking_count: partnerShare.partnerTierBookingCount,
        vantage_lane_retained_pence: partnerShare.vantageLaneRetainedPence,

        // LEGACY COLUMNS - Backward Compatibility (mirror new values)
        driver_payout_pence: driverTargetPayoutPence, // Mirror driver_target_payout_pence
        vendor_cost_pence: vendorCostPence, // Mirrors driver_target_payout_pence in current model
        platform_profit_pence: platformProfitPence,

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

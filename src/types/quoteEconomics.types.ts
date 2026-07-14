/**
 * Quote-time economics snapshot — Phase 1C visibility layer.
 * All monetary fields are integer pence. Percentages as basis points (1000 = 10%).
 *
 * Persisted immutably on quote at creation (line_items.meta.economics_snapshot).
 * NOT accounting settlement truth.
 */

import type { CanonicalVehicleCategoryId, PricingValidationBookingType } from '../services/pricing-validation/pricingValidation.types';

export const QUOTE_ECONOMICS_SNAPSHOT_VERSION = 'quote_economics_v1' as const;

export type QuoteEconomicsSnapshotVersion = typeof QUOTE_ECONOMICS_SNAPSHOT_VERSION;

/** Per paid extra — monitor / future profitability analytics. */
export interface QuoteEconomicsExtraItem {
  service_item_id: string;
  client_price_pence: number;
  estimated_driver_payout_pence: number;
  /** Placeholder until supplier cost model exists (Phase 1C). */
  estimated_supplier_cost_pence: number;
}

export interface QuoteEconomicsSnapshotData {
  schema_version: QuoteEconomicsSnapshotVersion;
  organization_id: string;
  booking_type: PricingValidationBookingType | string;
  vehicle_category: CanonicalVehicleCategoryId | string | null;
  pricing_version_id: string | null;
  generated_at: string;

  /** Client pays (incl. VAT when enabled). */
  client_gross_pence: number;
  vat_pence: number;
  /** Net transport + extras before VAT (after discount). */
  client_net_pence: number;

  /** Accounting-style estimate (FSS-aligned), NOT marketplace tier payout. */
  estimated_platform_fee_pence: number;
  estimated_operator_payout_pence: number;
  estimated_driver_payout_pence: number;
  /** Sum of driver extras payout rules; included in estimated_driver_payout_pence. */
  estimated_driver_extras_payout_pence: number;
  /** Placeholder — supplier cost model not implemented (always 0 in v1). */
  estimated_supplier_cost_pence: number;

  /** From organization_financial_settings (estimate only). */
  estimated_processor_fee_pence: number;
  operational_reserve_pence: number;

  /** After estimated processor fee on gross. */
  retained_gross_pence: number;
  /** After estimated outflows from net (driver, operator, platform, supplier, reserve). */
  retained_net_pence: number;
  /** (retained_net_pence / client_gross_pence) × 10000 — basis points (1500 = 15%). */
  estimated_margin_pct: number;

  distance_miles: number;
  duration_minutes: number;
  is_fleet: boolean;

  extras: QuoteEconomicsExtraItem[];

  /** Audit — which config sources were frozen at quote time. */
  config_sources: {
    vat_from: 'organization_settings';
    commissions_from: 'organization_settings';
    processor_and_reserve_from: 'organization_financial_settings';
    payout_rules_from: 'service_item_payout_rules';
  };
}

export interface QuoteEconomicsMapperInput {
  organizationId: string;
  organizationSettings: {
    platform_commission_pct: number;
    operator_commission_pct: number;
    vat_rate: number;
  };
  financialSettings: {
    vat_enabled: boolean;
    processor_fee_pct: number;
    processor_fixed_fee_pence: number;
    default_operational_reserve_pence: number;
    hourly_operational_reserve_pence: number;
    daily_operational_reserve_pence: number;
    fleet_operational_reserve_pence: number;
  };
}

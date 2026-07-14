/**
 * Organization financial settings — Phase 1B economics configuration.
 * Stored in organization_financial_settings; percentages as decimals (0.20 = 20%).
 */

export interface OrganizationFinancialSettings {
  organization_id: string;
  vat_rate: number;
  vat_enabled: boolean;
  processor_fee_pct: number;
  processor_fixed_fee_pence: number;
  default_operational_reserve_pence: number;
  hourly_operational_reserve_pence: number;
  daily_operational_reserve_pence: number;
  fleet_operational_reserve_pence: number;
  low_margin_warning_pct: number;
  minimum_profit_pence: number;
}

export interface OrganizationFinancialSettingsRow extends OrganizationFinancialSettings {
  id: string;
  created_at: string;
  updated_at: string;
}

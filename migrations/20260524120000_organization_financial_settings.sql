-- Migration: organization_financial_settings (Phase 1B)
-- Description: Tenant-scoped economics configuration (VAT, processor fees, reserves, margin guardrails).
-- NOT wired to quote/pricing engine yet.
-- Author: System
-- Date: 2026-05-24

BEGIN;

CREATE TABLE IF NOT EXISTS organization_financial_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  vat_rate numeric(8, 6) NOT NULL DEFAULT 0.20,
  vat_enabled boolean NOT NULL DEFAULT true,
  processor_fee_pct numeric(8, 6) NOT NULL DEFAULT 0.014,
  processor_fixed_fee_pence integer NOT NULL DEFAULT 20,
  default_operational_reserve_pence integer NOT NULL DEFAULT 0,
  hourly_operational_reserve_pence integer NOT NULL DEFAULT 0,
  daily_operational_reserve_pence integer NOT NULL DEFAULT 0,
  fleet_operational_reserve_pence integer NOT NULL DEFAULT 0,
  low_margin_warning_pct numeric(8, 6) NOT NULL DEFAULT 0.10,
  minimum_profit_pence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organization_financial_settings_org_unique UNIQUE (organization_id),
  CONSTRAINT organization_financial_settings_vat_rate_range
  CHECK (vat_rate >= 0 AND vat_rate <= 1),
  CONSTRAINT organization_financial_settings_processor_fee_pct_range
  CHECK (processor_fee_pct >= 0 AND processor_fee_pct <= 1),
  CONSTRAINT organization_financial_settings_low_margin_warning_pct_range
  CHECK (low_margin_warning_pct >= 0 AND low_margin_warning_pct <= 1),
  CONSTRAINT organization_financial_settings_processor_fixed_fee_pence_nonneg
  CHECK (processor_fixed_fee_pence >= 0),
  CONSTRAINT organization_financial_settings_default_operational_reserve_pence_nonneg
  CHECK (default_operational_reserve_pence >= 0),
  CONSTRAINT organization_financial_settings_hourly_operational_reserve_pence_nonneg
  CHECK (hourly_operational_reserve_pence >= 0),
  CONSTRAINT organization_financial_settings_daily_operational_reserve_pence_nonneg
  CHECK (daily_operational_reserve_pence >= 0),
  CONSTRAINT organization_financial_settings_fleet_operational_reserve_pence_nonneg
  CHECK (fleet_operational_reserve_pence >= 0),
  CONSTRAINT organization_financial_settings_minimum_profit_pence_nonneg
  CHECK (minimum_profit_pence >= 0)
);

COMMENT ON TABLE organization_financial_settings IS
  'Phase 1B: org-scoped quote economics configuration (VAT, processor fees, operational reserves, margin guardrails).';
COMMENT ON COLUMN organization_financial_settings.vat_rate IS
  'Decimal VAT rate (e.g. 0.20 = 20%). Matches organization_settings convention.';
COMMENT ON COLUMN organization_financial_settings.processor_fee_pct IS
  'Payment processor percentage fee as decimal (e.g. 0.014 = 1.4%).';
COMMENT ON COLUMN organization_financial_settings.processor_fixed_fee_pence IS
  'Payment processor fixed fee in pence (e.g. 20 = £0.20).';
COMMENT ON COLUMN organization_financial_settings.low_margin_warning_pct IS
  'Margin ratio threshold for warn-mode validation (decimal 0-1).';

CREATE INDEX IF NOT EXISTS idx_organization_financial_settings_org
  ON organization_financial_settings (organization_id);

CREATE OR REPLACE FUNCTION set_organization_financial_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_financial_settings_updated_at ON organization_financial_settings;

CREATE TRIGGER trg_organization_financial_settings_updated_at
  BEFORE UPDATE ON organization_financial_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_organization_financial_settings_updated_at();

ALTER TABLE organization_financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_financial_settings_service_all
  ON organization_financial_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed canonical org when present
INSERT INTO organization_financial_settings (
  organization_id,
  vat_rate,
  vat_enabled,
  processor_fee_pct,
  processor_fixed_fee_pence,
  default_operational_reserve_pence,
  hourly_operational_reserve_pence,
  daily_operational_reserve_pence,
  fleet_operational_reserve_pence,
  low_margin_warning_pct,
  minimum_profit_pence
)
SELECT
  '9a5caade-4791-4860-93b5-12b1c4fa9830'::uuid,
  0.20,
  true,
  0.014,
  20,
  0,
  0,
  0,
  0,
  0.10,
  0
WHERE EXISTS (
  SELECT 1
  FROM organizations
  WHERE id = '9a5caade-4791-4860-93b5-12b1c4fa9830'::uuid
)
ON CONFLICT (organization_id) DO NOTHING;

COMMIT;

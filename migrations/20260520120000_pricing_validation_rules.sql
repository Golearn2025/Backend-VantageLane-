-- Migration: pricing_validation_rules (Phase 0 scaffold)
-- Description: Tenant-scoped economics guardrails for quote validation layer.
-- NOT wired to production quote flow yet.
-- Author: System
-- Date: 2026-05-20

BEGIN;

CREATE TABLE IF NOT EXISTS pricing_validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  booking_type text NULL,
  vehicle_category_id text NULL,
  rule_code text NOT NULL,
  threshold_value numeric(18, 4) NOT NULL,
  threshold_mode text NOT NULL,
  on_fail text NOT NULL DEFAULT 'block',
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pricing_validation_rules_booking_type_check
    CHECK (
      booking_type IS NULL
      OR booking_type IN ('oneway', 'return', 'hourly', 'daily')
    ),
  CONSTRAINT pricing_validation_rules_threshold_mode_check
    CHECK (threshold_mode IN ('gte', 'lte', 'pct_gte', 'pct_lte')),
  CONSTRAINT pricing_validation_rules_on_fail_check
    CHECK (on_fail IN ('block', 'warn')),
  CONSTRAINT pricing_validation_rules_priority_positive
    CHECK (priority > 0),
  CONSTRAINT pricing_validation_rules_vehicle_category_id_check
    CHECK (
      vehicle_category_id IS NULL
      OR vehicle_category_id IN ('executive', 'luxury', 'suv', 'mpv')
    )
);

COMMENT ON TABLE pricing_validation_rules IS
  'Phase 0: org-scoped quote economics validation rules. Fleet uses leg booking types; fleet is not a booking_type here.';
COMMENT ON COLUMN pricing_validation_rules.booking_type IS
  'NULL = all leg types; fleet legs use oneway|return|hourly|daily only.';
COMMENT ON COLUMN pricing_validation_rules.threshold_mode IS
  'gte|lte for absolute pence; pct_* compares ratio*10000 (basis points) to threshold_value.';
COMMENT ON COLUMN pricing_validation_rules.vehicle_category_id IS
  'Canonical vehicle category slug (executive|luxury|suv|mpv). NULL = all categories.';

CREATE INDEX IF NOT EXISTS idx_pricing_validation_rules_org_active
  ON pricing_validation_rules (organization_id, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_validation_rules_org_booking_vehicle
  ON pricing_validation_rules (
    organization_id,
    booking_type,
    vehicle_category_id
  )
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION set_pricing_validation_rules_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_validation_rules_updated_at ON pricing_validation_rules;

CREATE TRIGGER trg_pricing_validation_rules_updated_at
  BEFORE UPDATE ON pricing_validation_rules
  FOR EACH ROW
  EXECUTE FUNCTION set_pricing_validation_rules_updated_at();

ALTER TABLE pricing_validation_rules ENABLE ROW LEVEL SECURITY;

-- Service role / backend full access (adjust policies when admin UI lands)
CREATE POLICY pricing_validation_rules_service_all
  ON pricing_validation_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

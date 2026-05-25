-- =============================================================================
-- DRAFT MIGRATION (LOCAL ONLY — DO NOT APPLY WITHOUT REVIEW)
-- =============================================================================
-- Purpose: Add daily booking duration bounds to pricing_daily_rules
--          (symmetric with pricing_hourly_rules.minimum_hours / maximum_hours)
--
-- Architecture:
--   - Rates stay on pricing_vehicle_rates (daily_rate_pence)
--   - Package semantics + duration bounds stay on pricing_daily_rules
--   - Multi-tenant: organization_id preserved
--   - Versioning: pricing_version_id preserved; v_pricing_daily_rules filters active version
--
-- Author: Vantage Lane engineering (draft for Cristi)
-- Date: 2026-05-24
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) Pre-flight safety (fails fast if invalid data would block constraints)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pricing_daily_rules'
  ) THEN
    RAISE EXCEPTION 'pricing_daily_rules table not found — aborting draft migration';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Add columns (nullable first — safe backfill pattern)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_daily_rules
  ADD COLUMN IF NOT EXISTS minimum_days integer,
  ADD COLUMN IF NOT EXISTS maximum_days integer;

COMMENT ON COLUMN public.pricing_daily_rules.minimum_days IS
  'Minimum billable days for daily bookings (per org, pricing version, vehicle category). Engine should clamp request.days >= this value.';

COMMENT ON COLUMN public.pricing_daily_rules.maximum_days IS
  'Maximum billable days for daily bookings (per org, pricing version, vehicle category). Engine and website selectors should not exceed this value.';

-- -----------------------------------------------------------------------------
-- 2) Backfill existing rows (product defaults — adjust before apply if needed)
-- -----------------------------------------------------------------------------
-- Defaults chosen to match current website behaviour (fallback min=1, max=30)
-- and preserve backward-compatible quotes for days=1.
UPDATE public.pricing_daily_rules
SET
  minimum_days = COALESCE(minimum_days, 1),
  maximum_days = COALESCE(maximum_days, 30)
WHERE minimum_days IS NULL OR maximum_days IS NULL;

-- -----------------------------------------------------------------------------
-- 3) Enforce NOT NULL after backfill
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_daily_rules
  ALTER COLUMN minimum_days SET NOT NULL,
  ALTER COLUMN maximum_days SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) Column defaults for future inserts (admin / seed scripts)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_daily_rules
  ALTER COLUMN minimum_days SET DEFAULT 1,
  ALTER COLUMN maximum_days SET DEFAULT 30;

-- -----------------------------------------------------------------------------
-- 5) Integrity constraints
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_daily_rules
  DROP CONSTRAINT IF EXISTS pricing_daily_rules_minimum_days_positive;

ALTER TABLE public.pricing_daily_rules
  ADD CONSTRAINT pricing_daily_rules_minimum_days_positive
  CHECK (minimum_days >= 1);

ALTER TABLE public.pricing_daily_rules
  DROP CONSTRAINT IF EXISTS pricing_daily_rules_max_days_gte_min;

ALTER TABLE public.pricing_daily_rules
  ADD CONSTRAINT pricing_daily_rules_max_days_gte_min
  CHECK (maximum_days >= minimum_days);

-- Optional sanity ceiling (calendar/booking window is separate on organization_settings)
ALTER TABLE public.pricing_daily_rules
  DROP CONSTRAINT IF EXISTS pricing_daily_rules_max_days_sane;

ALTER TABLE public.pricing_daily_rules
  ADD CONSTRAINT pricing_daily_rules_max_days_sane
  CHECK (maximum_days <= 365);

-- -----------------------------------------------------------------------------
-- 6) Optional but recommended: one rule row per org + version + vehicle
--     (mirrors uq_pricing_vehicle_rates_org_version_vehicle_type on rates)
-- Pre-check: no duplicates today — safe to add.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_daily_rules_org_version_vehicle
  ON public.pricing_daily_rules (
    organization_id,
    pricing_version_id,
    vehicle_category_id
  );

COMMENT ON INDEX public.uq_pricing_daily_rules_org_version_vehicle IS
  'Prevents duplicate daily rule rows per pricing version and vehicle category.';

-- -----------------------------------------------------------------------------
-- 7) Recreate read view (DROP required — Postgres rejects column-order REPLACE)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_pricing_daily_rules;

CREATE VIEW public.v_pricing_daily_rules AS
SELECT
  r.id,
  r.organization_id,
  r.vehicle_category_id,
  r.included_hours,
  r.minimum_days,
  r.maximum_days,
  r.extra_hour_rate_pence,
  r.included_miles,
  r.extra_mile_rate_pence,
  r.active,
  r.created_at,
  r.pricing_version_id
FROM public.pricing_daily_rules r
JOIN public.pricing_versions v ON r.pricing_version_id = v.id
WHERE r.active = true
  AND v.is_active = true
  AND r.organization_id = v.organization_id;

COMMENT ON VIEW public.v_pricing_daily_rules IS
  'Active published daily rules for the active pricing version per organization. Includes minimum_days and maximum_days.';

-- -----------------------------------------------------------------------------
-- 8) Post-migration verification (raises if backfill incomplete)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM public.pricing_daily_rules
  WHERE minimum_days IS NULL OR maximum_days IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'pricing_daily_rules backfill incomplete: % rows still NULL', null_count;
  END IF;

  RAISE NOTICE 'pricing_daily_rules min/max days migration checks passed';
END $$;

COMMIT;

-- =============================================================================
-- END DRAFT FORWARD MIGRATION
-- =============================================================================

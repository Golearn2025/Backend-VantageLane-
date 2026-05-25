-- =============================================================================
-- DRAFT ROLLBACK (LOCAL ONLY — pair with 20260524190000_pricing_daily_rules_min_max_days.sql)
-- =============================================================================
-- Restores v_pricing_daily_rules and drops minimum_days / maximum_days columns.
--
-- WARNING: Any admin edits to min/max days after forward migration will be lost.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Restore view without new columns (previous production definition)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pricing_daily_rules AS
SELECT
  r.id,
  r.organization_id,
  r.vehicle_category_id,
  r.included_hours,
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

-- -----------------------------------------------------------------------------
-- 2) Drop unique index added by forward migration
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_pricing_daily_rules_org_version_vehicle;

-- -----------------------------------------------------------------------------
-- 3) Drop constraints
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_daily_rules
  DROP CONSTRAINT IF EXISTS pricing_daily_rules_max_days_sane;

ALTER TABLE public.pricing_daily_rules
  DROP CONSTRAINT IF EXISTS pricing_daily_rules_max_days_gte_min;

ALTER TABLE public.pricing_daily_rules
  DROP CONSTRAINT IF EXISTS pricing_daily_rules_minimum_days_positive;

-- -----------------------------------------------------------------------------
-- 4) Drop columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_daily_rules
  DROP COLUMN IF EXISTS maximum_days,
  DROP COLUMN IF EXISTS minimum_days;

COMMIT;

-- =============================================================================
-- END DRAFT ROLLBACK
-- =============================================================================

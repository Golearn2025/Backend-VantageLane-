-- Migration: 001_add_dual_quote_stop_config_to_pricing_versions.sql
-- Description: Add business config for dual quote stop pricing with grace threshold
-- Author: System
-- Date: 2026-03-29
-- Phase: 1
--
-- This migration adds configuration columns to pricing_versions table to support
-- dual quote stop pricing logic with grace threshold as an alternative to the
-- legacy flat £15 per stop fee.
--
-- Business Logic:
-- - enable_dual_quote_stop_logic: Controls whether to use new dual quote logic (true)
--   or legacy flat fee (false). Can be overridden by env var DISABLE_DUAL_QUOTE_STOP_LOGIC.
-- - stop_grace_threshold_miles: Distance threshold below which detours may be ignored
-- - stop_grace_threshold_minutes: Time threshold below which detours may be ignored
-- - multi_stop_fee_pence: Legacy flat fee per stop (£15 = 1500 pence), used when
--   dual quote logic is disabled
--
-- All columns have sensible defaults to ensure backward compatibility with existing
-- pricing versions.

BEGIN;

-- Add dual quote stop pricing configuration columns
ALTER TABLE pricing_versions
ADD COLUMN enable_dual_quote_stop_logic boolean NOT NULL DEFAULT false,
ADD COLUMN stop_grace_threshold_miles numeric(5,2) NOT NULL DEFAULT 0.5,
ADD COLUMN stop_grace_threshold_minutes integer NOT NULL DEFAULT 5,
ADD COLUMN multi_stop_fee_pence integer NOT NULL DEFAULT 1500,
ADD COLUMN stop_pricing_notes text;

-- Add check constraints for data sanity
ALTER TABLE pricing_versions
ADD CONSTRAINT check_stop_grace_threshold_miles_positive 
  CHECK (stop_grace_threshold_miles >= 0 AND stop_grace_threshold_miles <= 10),
ADD CONSTRAINT check_stop_grace_threshold_minutes_positive 
  CHECK (stop_grace_threshold_minutes >= 0 AND stop_grace_threshold_minutes <= 60),
ADD CONSTRAINT check_multi_stop_fee_pence_non_negative 
  CHECK (multi_stop_fee_pence >= 0);

-- Add comments for documentation
COMMENT ON COLUMN pricing_versions.enable_dual_quote_stop_logic IS 
  'Enable dual quote stop pricing with grace threshold (true) or use legacy flat fee (false). Can be overridden by env var DISABLE_DUAL_QUOTE_STOP_LOGIC for emergency rollback.';

COMMENT ON COLUMN pricing_versions.stop_grace_threshold_miles IS 
  'Grace threshold in miles - detours below this threshold may use direct quote pricing. Default: 0.5 miles.';

COMMENT ON COLUMN pricing_versions.stop_grace_threshold_minutes IS 
  'Grace threshold in minutes - detours below this threshold may use direct quote pricing. Default: 5 minutes.';

COMMENT ON COLUMN pricing_versions.multi_stop_fee_pence IS 
  'Legacy flat fee per stop in pence (default £15 = 1500 pence). Used as fallback when dual quote logic is disabled.';

COMMENT ON COLUMN pricing_versions.stop_pricing_notes IS 
  'Business notes and documentation for stop pricing configuration in this version.';

COMMIT;

-- Verification query (run after migration):
-- SELECT 
--   version_name,
--   enable_dual_quote_stop_logic,
--   stop_grace_threshold_miles,
--   stop_grace_threshold_minutes,
--   multi_stop_fee_pence,
--   stop_pricing_notes
-- FROM pricing_versions
-- WHERE is_active = true;
--
-- Expected: All existing versions have defaults applied (false, 0.5, 5, 1500, NULL)

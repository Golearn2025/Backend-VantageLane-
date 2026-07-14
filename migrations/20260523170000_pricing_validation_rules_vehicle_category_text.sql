-- Migration: vehicle_category_id uuid → text (canonical platform IDs)
-- Safe: table has no production rows at Phase 0; preserves indexes, trigger, RLS.
-- Canonical IDs: executive | luxury | suv | mpv (same as pricing engine / booking legs)

BEGIN;

ALTER TABLE pricing_validation_rules
  ALTER COLUMN vehicle_category_id TYPE text
  USING vehicle_category_id::text;

COMMENT ON COLUMN pricing_validation_rules.vehicle_category_id IS
  'Canonical vehicle category slug (executive|luxury|suv|mpv). NULL = all categories.';

ALTER TABLE pricing_validation_rules
  DROP CONSTRAINT IF EXISTS pricing_validation_rules_vehicle_category_id_check;

ALTER TABLE pricing_validation_rules
  ADD CONSTRAINT pricing_validation_rules_vehicle_category_id_check
  CHECK (
    vehicle_category_id IS NULL
    OR vehicle_category_id IN ('executive', 'luxury', 'suv', 'mpv')
  );

COMMIT;

-- Migration: 002_add_route_metrics_and_pricing_logic_to_quotes.sql
-- Description: Add explicit columns for route metrics and pricing logic audit
-- Author: System
-- Date: 2026-03-29
-- Phase: 1
--
-- This migration adds audit and queryability columns to client_booking_quotes table
-- to support dual quote stop pricing logic. These columns store the calculated
-- route metrics (direct vs full route) and the pricing decision (which quote was used).
--
-- IMPORTANT: Route metrics and pricing logic are SOURCE OF TRUTH in quotes.
-- They are NOT copied to bookings.trip_configuration_raw in Phase 1.
-- To access route metrics for a booking, JOIN with client_booking_quotes on booking_id.
--
-- Data Access Pattern:
-- SELECT b.*, cbq.direct_distance_miles, cbq.stop_grace_applied
-- FROM bookings b
-- JOIN client_booking_quotes cbq ON cbq.booking_id = b.id
-- WHERE b.id = 'booking_id';
--
-- All columns are NULLABLE to ensure backward compatibility with existing quotes.
-- Only new quotes created with dual quote logic enabled will populate these columns.

BEGIN;

-- Add route metrics columns
-- These columns store the calculated route distances and durations for audit purposes
ALTER TABLE client_booking_quotes
ADD COLUMN direct_distance_miles numeric(10,2),
ADD COLUMN direct_duration_minutes integer,
ADD COLUMN full_distance_miles numeric(10,2),
ADD COLUMN full_duration_minutes integer,
ADD COLUMN detour_distance_miles numeric(10,2),
ADD COLUMN detour_duration_minutes integer;

-- Add pricing logic audit columns
-- These columns store the pricing decision and quotes for reproducibility
ALTER TABLE client_booking_quotes
ADD COLUMN direct_quote_pence integer,
ADD COLUMN full_quote_pence integer,
ADD COLUMN stop_grace_applied boolean,
ADD COLUMN stop_grace_threshold_miles numeric(5,2),
ADD COLUMN stop_grace_threshold_minutes integer,
ADD COLUMN stop_pricing_strategy text;

-- Add check constraint for pricing strategy enum
ALTER TABLE client_booking_quotes
ADD CONSTRAINT check_stop_pricing_strategy 
  CHECK (stop_pricing_strategy IS NULL OR stop_pricing_strategy IN ('direct', 'full'));

-- Add check constraints for data sanity (non-negative values)
ALTER TABLE client_booking_quotes
ADD CONSTRAINT check_direct_distance_non_negative 
  CHECK (direct_distance_miles IS NULL OR direct_distance_miles >= 0),
ADD CONSTRAINT check_full_distance_non_negative 
  CHECK (full_distance_miles IS NULL OR full_distance_miles >= 0),
ADD CONSTRAINT check_detour_distance_non_negative 
  CHECK (detour_distance_miles IS NULL OR detour_distance_miles >= 0),
ADD CONSTRAINT check_direct_duration_non_negative 
  CHECK (direct_duration_minutes IS NULL OR direct_duration_minutes >= 0),
ADD CONSTRAINT check_full_duration_non_negative 
  CHECK (full_duration_minutes IS NULL OR full_duration_minutes >= 0),
ADD CONSTRAINT check_detour_duration_non_negative 
  CHECK (detour_duration_minutes IS NULL OR detour_duration_minutes >= 0),
ADD CONSTRAINT check_direct_quote_non_negative 
  CHECK (direct_quote_pence IS NULL OR direct_quote_pence >= 0),
ADD CONSTRAINT check_full_quote_non_negative 
  CHECK (full_quote_pence IS NULL OR full_quote_pence >= 0);

-- Add comments for documentation
COMMENT ON COLUMN client_booking_quotes.direct_distance_miles IS 
  'Direct route distance (pickup → dropoff, no stops) in miles. Used for dual quote pricing comparison.';

COMMENT ON COLUMN client_booking_quotes.direct_duration_minutes IS 
  'Direct route duration (pickup → dropoff, no stops) in minutes. Used for dual quote pricing comparison.';

COMMENT ON COLUMN client_booking_quotes.full_distance_miles IS 
  'Full route distance (pickup → stops → dropoff) in miles. Includes all additional stops.';

COMMENT ON COLUMN client_booking_quotes.full_duration_minutes IS 
  'Full route duration (pickup → stops → dropoff) in minutes. Includes all additional stops.';

COMMENT ON COLUMN client_booking_quotes.detour_distance_miles IS 
  'Detour distance caused by stops (full - direct) in miles. KEY AUDIT METRIC for grace threshold evaluation.';

COMMENT ON COLUMN client_booking_quotes.detour_duration_minutes IS 
  'Detour duration caused by stops (full - direct) in minutes. KEY AUDIT METRIC for grace threshold evaluation.';

COMMENT ON COLUMN client_booking_quotes.direct_quote_pence IS 
  'Quote calculated for direct route (no stops) in pence. Used for comparison in dual quote logic.';

COMMENT ON COLUMN client_booking_quotes.full_quote_pence IS 
  'Quote calculated for full route (with stops) in pence. Used for comparison in dual quote logic.';

COMMENT ON COLUMN client_booking_quotes.stop_grace_applied IS 
  'Whether grace threshold was applied (true = direct quote used despite stops). CRITICAL DECISION for audit.';

COMMENT ON COLUMN client_booking_quotes.stop_grace_threshold_miles IS 
  'Snapshot of grace threshold miles used for this quote. Stored for reproducibility and audit trail.';

COMMENT ON COLUMN client_booking_quotes.stop_grace_threshold_minutes IS 
  'Snapshot of grace threshold minutes used for this quote. Stored for reproducibility and audit trail.';

COMMENT ON COLUMN client_booking_quotes.stop_pricing_strategy IS 
  'Pricing strategy selected: "direct" (grace applied) or "full" (grace not applied). CRITICAL DECISION for audit.';

COMMIT;

-- Verification query (run after migration):
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'client_booking_quotes'
--   AND column_name LIKE '%stop%' OR column_name LIKE '%direct%' OR column_name LIKE '%detour%'
-- ORDER BY column_name;
--
-- Expected: All new columns present, all nullable (YES), no defaults

-- Example query to access route metrics for a booking:
-- SELECT 
--   b.id as booking_id,
--   b.reference,
--   cbq.direct_distance_miles,
--   cbq.full_distance_miles,
--   cbq.detour_distance_miles,
--   cbq.stop_grace_applied,
--   cbq.stop_pricing_strategy
-- FROM bookings b
-- JOIN client_booking_quotes cbq ON cbq.booking_id = b.id
-- WHERE b.id = 'your-booking-id';

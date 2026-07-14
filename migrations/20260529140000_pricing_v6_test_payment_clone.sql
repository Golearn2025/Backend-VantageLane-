-- v6-test-payment: clone COMPLET din v2 (toate tabelele versionate din Admin Prices)
-- + suprascriere sume mici pentru plăți Stripe LIVE (~£0.99–£2 NET).
--
-- Tab-uri Admin acoperite (versionate → clonate per v6):
--   Vehicle Rates 28 | Time 4 | Airport 5 | Zone 3 | Hourly 4 | Daily 4
--   Rounding 1 | Driver Tiers 24
--
-- Tab-uri SHARED (org/global — aceleași rânduri indiferent de versiune):
--   Return 1 | Fleet 2 | VAT & Commission | Extras 43 | Bonuses 6 | Suppliers 5
--   → nu se clonează; la test evită extras scumpe sau editează manual price_pence.
--
-- După migrare: Admin → Prices → selectează v6-test-payment → verifică count-urile.
-- Pentru test LIVE: activează DOAR v6, apoi revino la v2.

BEGIN;

DO $$
DECLARE
  src_id uuid := '788745f6-5115-482f-9a88-91b0783893c4'; -- v2 activ
  dst_id uuid;
  org_id uuid;
BEGIN
  SELECT organization_id INTO org_id FROM pricing_versions WHERE id = src_id;
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Source v2 not found: %', src_id;
  END IF;

  SELECT id INTO dst_id
  FROM pricing_versions
  WHERE organization_id = org_id AND version_number = 6
  LIMIT 1;

  IF dst_id IS NULL THEN
    INSERT INTO pricing_versions (
      organization_id,
      version_name,
      version_number,
      description,
      is_active,
      is_published,
      effective_from,
      effective_until,
      valid_from,
      valid_until,
      notes,
      multi_stop_fee_pence,
      driver_pricing_factor,
      driver_min_payout_pence,
      driver_max_payout_pence,
      enable_dual_quote_stop_logic,
      stop_grace_threshold_miles,
      stop_grace_threshold_minutes,
      stop_pricing_notes
    )
    SELECT
      organization_id,
      'v6-test-payment',
      6,
      'Stripe LIVE test — sume mici. NU lăsa activ pe producție.',
      false,
      true,
      now(),
      NULL,
      valid_from,
      valid_until,
      'Clone v2 + prețuri test ~99p',
      99,
      driver_pricing_factor,
      50,
      99,
      enable_dual_quote_stop_logic,
      stop_grace_threshold_miles,
      stop_grace_threshold_minutes,
      'Test payment version — revert to v2 after Stripe LIVE checks.'
    FROM pricing_versions
    WHERE id = src_id
    RETURNING id INTO dst_id;
  ELSE
    UPDATE pricing_versions SET
      version_name = 'v6-test-payment',
      description = 'Stripe LIVE test — sume mici. NU lăsa activ pe producție.',
      is_active = false,
      is_published = true,
      multi_stop_fee_pence = 99,
      driver_min_payout_pence = 50,
      driver_max_payout_pence = 99,
      notes = 'Clone v2 + prețuri test ~99p'
    WHERE id = dst_id;
  END IF;

  RAISE NOTICE 'v6-test-payment id: % (source v2: %)', dst_id, src_id;

  -- Re-clone: șterge rândurile v6 existente (idempotent re-run)
  DELETE FROM payout_escalation_tiers WHERE pricing_version_id = dst_id;
  DELETE FROM pricing_rounding_rules WHERE pricing_version_id = dst_id;
  DELETE FROM pricing_zone_fees WHERE pricing_version_id = dst_id;
  DELETE FROM pricing_airport_fees WHERE pricing_version_id = dst_id;
  DELETE FROM pricing_time_rules WHERE pricing_version_id = dst_id;
  DELETE FROM pricing_daily_rules WHERE pricing_version_id = dst_id;
  DELETE FROM pricing_hourly_rules WHERE pricing_version_id = dst_id;
  DELETE FROM pricing_vehicle_rates WHERE pricing_version_id = dst_id;

  -- ── 28 Vehicle Rates ────────────────────────────────────────────────────
  INSERT INTO pricing_vehicle_rates (
    organization_id, pricing_version_id, vehicle_category_id, booking_type,
    base_fare_pence, per_mile_first_6_pence, per_mile_after_6_pence, per_minute_pence,
    hourly_rate_pence, daily_rate_pence, minimum_fare_pence,
    currency, active, driver_min_payout_pence, driver_max_payout_pence,
    created_at, updated_at
  )
  SELECT
    organization_id, dst_id, vehicle_category_id, booking_type,
    base_fare_pence, per_mile_first_6_pence, per_mile_after_6_pence, per_minute_pence,
    hourly_rate_pence, daily_rate_pence, minimum_fare_pence,
    currency, active, driver_min_payout_pence, driver_max_payout_pence,
    now(), now()
  FROM pricing_vehicle_rates
  WHERE pricing_version_id = src_id;

  -- ── 4 Hourly ────────────────────────────────────────────────────────────
  INSERT INTO pricing_hourly_rules (
    organization_id, pricing_version_id, vehicle_category_id,
    minimum_hours, maximum_hours, billing_increment_hours, active, created_at
  )
  SELECT
    organization_id, dst_id, vehicle_category_id,
    minimum_hours, maximum_hours, billing_increment_hours, active, now()
  FROM pricing_hourly_rules
  WHERE pricing_version_id = src_id;

  -- ── 4 Daily ─────────────────────────────────────────────────────────────
  INSERT INTO pricing_daily_rules (
    organization_id, pricing_version_id, vehicle_category_id,
    included_hours, extra_hour_rate_pence, included_miles, extra_mile_rate_pence,
    minimum_days, maximum_days, active, created_at
  )
  SELECT
    organization_id, dst_id, vehicle_category_id,
    included_hours, extra_hour_rate_pence, included_miles, extra_mile_rate_pence,
    minimum_days, maximum_days, active, now()
  FROM pricing_daily_rules
  WHERE pricing_version_id = src_id;

  -- ── 4 Time Rules ────────────────────────────────────────────────────────
  INSERT INTO pricing_time_rules (
    organization_id, pricing_version_id, rule_name, day_of_week,
    start_time, end_time, multiplier, active, created_at
  )
  SELECT
    organization_id, dst_id, rule_name, day_of_week,
    start_time, end_time, multiplier, active, now()
  FROM pricing_time_rules
  WHERE pricing_version_id = src_id;

  -- ── 5 Airport Fees ──────────────────────────────────────────────────────
  INSERT INTO pricing_airport_fees (
    organization_id, pricing_version_id, airport_code,
    pickup_fee_pence, dropoff_fee_pence, parking_fee_pence,
    included_wait_minutes, extra_wait_per_minute_pence, parking_allowance_pence,
    active, created_at
  )
  SELECT
    organization_id, dst_id, airport_code,
    pickup_fee_pence, dropoff_fee_pence, parking_fee_pence,
    included_wait_minutes, extra_wait_per_minute_pence, parking_allowance_pence,
    active, now()
  FROM pricing_airport_fees
  WHERE pricing_version_id = src_id;

  -- ── 3 Zone Fees ─────────────────────────────────────────────────────────
  INSERT INTO pricing_zone_fees (
    organization_id, pricing_version_id, zone_code, fee_pence, active, created_at
  )
  SELECT organization_id, dst_id, zone_code, fee_pence, active, now()
  FROM pricing_zone_fees
  WHERE pricing_version_id = src_id;

  -- ── 1 Rounding ──────────────────────────────────────────────────────────
  INSERT INTO pricing_rounding_rules (
    organization_id, pricing_version_id, rounding_step_pence, rounding_mode, created_at
  )
  SELECT organization_id, dst_id, rounding_step_pence, rounding_mode, now()
  FROM pricing_rounding_rules
  WHERE pricing_version_id = src_id;

  -- ── 24 Driver Tiers ─────────────────────────────────────────────────────
  INSERT INTO payout_escalation_tiers (
    pricing_version_id, tier_group, vehicle_category_id, label,
    min_hours_before_job, max_hours_before_job, driver_payout_factor,
    sort_order, is_active, created_at
  )
  SELECT
    dst_id, tier_group, vehicle_category_id, label,
    min_hours_before_job, max_hours_before_job, driver_payout_factor,
    sort_order, is_active, now()
  FROM payout_escalation_tiers
  WHERE pricing_version_id = src_id;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PREȚURI TEST (NET, pence) — client GROSS max ~£1.00 (83p NET + VAT 20%)
  -- Minimum = plafon inferior; mile/min = 0 ca distanța lungă să nu explodeze totalul.
  -- ══════════════════════════════════════════════════════════════════════════

  UPDATE pricing_vehicle_rates SET
    base_fare_pence = 1,
    per_mile_first_6_pence = 0,
    per_mile_after_6_pence = 0,
    per_minute_pence = 0,
    minimum_fare_pence = 83,
    driver_min_payout_pence = 1,
    driver_max_payout_pence = 10,
    updated_at = now()
  WHERE pricing_version_id = dst_id
    AND booking_type IN ('oneway', 'return', 'fleet');

  UPDATE pricing_vehicle_rates SET
    hourly_rate_pence = 1,
    minimum_fare_pence = 83,
    base_fare_pence = 0,
    per_mile_first_6_pence = 0,
    per_mile_after_6_pence = 0,
    per_minute_pence = 0,
    driver_min_payout_pence = 1,
    driver_max_payout_pence = 10,
    updated_at = now()
  WHERE pricing_version_id = dst_id
    AND booking_type IN ('hourly', 'fleet_hourly');

  UPDATE pricing_vehicle_rates SET
    daily_rate_pence = 1,
    minimum_fare_pence = 83,
    base_fare_pence = 0,
    per_mile_first_6_pence = 0,
    per_mile_after_6_pence = 0,
    per_minute_pence = 0,
    hourly_rate_pence = 0,
    driver_min_payout_pence = 1,
    driver_max_payout_pence = 10,
    updated_at = now()
  WHERE pricing_version_id = dst_id
    AND booking_type IN ('daily', 'fleet_daily');

  UPDATE pricing_daily_rules SET
    extra_hour_rate_pence = COALESCE(extra_hour_rate_pence, 0),
    extra_mile_rate_pence = COALESCE(extra_mile_rate_pence, 0)
  WHERE pricing_version_id = dst_id;

  UPDATE pricing_airport_fees SET
    pickup_fee_pence = 0,
    dropoff_fee_pence = 0,
    parking_fee_pence = 0,
    extra_wait_per_minute_pence = 0,
    parking_allowance_pence = 0
  WHERE pricing_version_id = dst_id;

  UPDATE pricing_zone_fees SET fee_pence = 0 WHERE pricing_version_id = dst_id;

  UPDATE pricing_rounding_rules SET rounding_step_pence = 1 WHERE pricing_version_id = dst_id;

  UPDATE pricing_versions SET
    multi_stop_fee_pence = 10,
    driver_min_payout_pence = 1,
    driver_max_payout_pence = 10
  WHERE id = dst_id;

END $$;

COMMIT;

-- Verificare (rulează separat):
-- WITH v6 AS (SELECT id FROM pricing_versions WHERE version_number = 6)
-- SELECT 'vehicle_rates' t, count(*) FROM pricing_vehicle_rates r, v6 WHERE r.pricing_version_id = v6.id
-- UNION ALL SELECT 'hourly', count(*) FROM pricing_hourly_rules r, v6 WHERE r.pricing_version_id = v6.id
-- UNION ALL SELECT 'daily', count(*) FROM pricing_daily_rules r, v6 WHERE r.pricing_version_id = v6.id
-- UNION ALL SELECT 'time', count(*) FROM pricing_time_rules r, v6 WHERE r.pricing_version_id = v6.id
-- UNION ALL SELECT 'airport', count(*) FROM pricing_airport_fees r, v6 WHERE r.pricing_version_id = v6.id
-- UNION ALL SELECT 'zone', count(*) FROM pricing_zone_fees r, v6 WHERE r.pricing_version_id = v6.id
-- UNION ALL SELECT 'rounding', count(*) FROM pricing_rounding_rules r, v6 WHERE r.pricing_version_id = v6.id
-- UNION ALL SELECT 'tiers', count(*) FROM payout_escalation_tiers r, v6 WHERE r.pricing_version_id = v6.id;

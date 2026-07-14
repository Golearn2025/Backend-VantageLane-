-- Client retail vehicle rates (30% markup market table)
-- SSOT: pricing_vehicle_rates on active published pricing version
-- Backend reads via v_pricing_vehicle_rates (PricingDataService.getVehicleRates)

BEGIN;

WITH active_version AS (
  SELECT id
  FROM pricing_versions
  WHERE is_active = true
    AND is_published = true
  ORDER BY effective_from DESC NULLS LAST
  LIMIT 1
)

-- EXECUTIVE ONEWAY
UPDATE pricing_vehicle_rates r
SET
  base_fare_pence = 5200,
  per_mile_first_6_pence = 390,
  per_mile_after_6_pence = 310,
  per_minute_pence = 58,
  minimum_fare_pence = 7200,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'executive'
  AND r.booking_type = 'oneway';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  base_fare_pence = 9100,
  per_mile_first_6_pence = 364,
  per_mile_after_6_pence = 286,
  per_minute_pence = 52,
  minimum_fare_pence = 11700,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'executive'
  AND r.booking_type = 'return';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  hourly_rate_pence = 5800,
  minimum_fare_pence = 23400,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'executive'
  AND r.booking_type = 'hourly';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  daily_rate_pence = 52000,
  minimum_fare_pence = 52000,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'executive'
  AND r.booking_type = 'daily';

-- LUXURY ONEWAY
WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  base_fare_pence = 7800,
  per_mile_first_6_pence = 585,
  per_mile_after_6_pence = 442,
  per_minute_pence = 78,
  minimum_fare_pence = 11700,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'luxury'
  AND r.booking_type = 'oneway';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  base_fare_pence = 15600,
  per_mile_first_6_pence = 520,
  per_mile_after_6_pence = 390,
  per_minute_pence = 72,
  minimum_fare_pence = 19500,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'luxury'
  AND r.booking_type = 'return';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  hourly_rate_pence = 8500,
  minimum_fare_pence = 33800,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'luxury'
  AND r.booking_type = 'hourly';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  daily_rate_pence = 91000,
  minimum_fare_pence = 91000,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'luxury'
  AND r.booking_type = 'daily';

-- SUV ONEWAY
WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  base_fare_pence = 10400,
  per_mile_first_6_pence = 715,
  per_mile_after_6_pence = 585,
  per_minute_pence = 117,
  minimum_fare_pence = 15600,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'suv'
  AND r.booking_type = 'oneway';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  base_fare_pence = 20800,
  per_mile_first_6_pence = 650,
  per_mile_after_6_pence = 520,
  per_minute_pence = 98,
  minimum_fare_pence = 28600,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'suv'
  AND r.booking_type = 'return';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  hourly_rate_pence = 13000,
  minimum_fare_pence = 52000,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'suv'
  AND r.booking_type = 'hourly';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  daily_rate_pence = 156000,
  minimum_fare_pence = 156000,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'suv'
  AND r.booking_type = 'daily';

-- MPV ONEWAY
WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  base_fare_pence = 6500,
  per_mile_first_6_pence = 495,
  per_mile_after_6_pence = 390,
  per_minute_pence = 72,
  minimum_fare_pence = 10400,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'mpv'
  AND r.booking_type = 'oneway';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  base_fare_pence = 14300,
  per_mile_first_6_pence = 455,
  per_mile_after_6_pence = 364,
  per_minute_pence = 65,
  minimum_fare_pence = 18200,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'mpv'
  AND r.booking_type = 'return';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  hourly_rate_pence = 7200,
  minimum_fare_pence = 28600,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'mpv'
  AND r.booking_type = 'hourly';

WITH active_version AS (
  SELECT id FROM pricing_versions WHERE is_active = true AND is_published = true LIMIT 1
)
UPDATE pricing_vehicle_rates r
SET
  daily_rate_pence = 84500,
  minimum_fare_pence = 84500,
  updated_at = now()
FROM active_version v
WHERE r.pricing_version_id = v.id
  AND r.vehicle_category_id = 'mpv'
  AND r.booking_type = 'daily';

COMMIT;

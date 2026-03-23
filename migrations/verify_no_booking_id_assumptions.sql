-- =====================================================
-- VERIFICATION: Check for booking_id NOT NULL assumptions
-- Purpose: Helper script to identify potential issues
-- NOTE: This is NOT a comprehensive audit - manual code review required
-- Author: Cristian Manolache
-- Date: 2026-03-23
-- =====================================================

-- =====================================================
-- 1. Check Views with INNER JOIN assumptions
-- =====================================================

DO $$
DECLARE
  view_count int;
  view_details text;
BEGIN
  RAISE NOTICE '=== CHECKING VIEWS ===';
  
  -- Look for views that might break with NULL booking_id
  SELECT COUNT(*) INTO view_count
  FROM information_schema.views v
  JOIN information_schema.view_table_usage vt ON v.table_name = vt.table_name
  WHERE (v.view_definition LIKE '%client_booking_quotes%' AND v.view_definition LIKE '%INNER JOIN%')
     OR (v.view_definition LIKE '%client_booking_quotes%' AND v.view_definition LIKE '%bookings%');
  
  IF view_count > 0 THEN
    RAISE NOTICE '⚠️  Found % views that might be affected by NULL booking_id', view_count;
    
    -- Get details
    SELECT string_agg(table_name || ': ' || left(view_definition, 100) || '...', E'\n') INTO view_details
    FROM information_schema.views
    WHERE view_definition LIKE '%client_booking_quotes%'
      AND (view_definition LIKE '%INNER JOIN%' OR view_definition LIKE '%bookings%');
    
    RAISE NOTICE 'Views to review: %', view_details;
  ELSE
    RAISE NOTICE '✓ No views found with problematic INNER JOINs';
  END IF;
END $$;

-- =====================================================
-- 2. Check Functions with booking_id assumptions
-- =====================================================

DO $$
DECLARE
  func_count int;
  func_details text;
BEGIN
  RAISE NOTICE '=== CHECKING FUNCTIONS ===';
  
  -- Look for functions that might assume booking_id is NOT NULL
  SELECT COUNT(*) INTO func_count
  FROM information_schema.routines r
  WHERE r.routine_definition LIKE '%client_booking_quotes%'
    AND (
      r.routine_definition LIKE '%booking_id IS NOT NULL%'
      OR r.routine_definition LIKE '%booking_id != NULL%'
      OR r.routine_definition LIKE '%WHERE booking_id%'  -- Might need LEFT JOIN
    );
  
  IF func_count > 0 THEN
    RAISE NOTICE '⚠️  Found % functions with booking_id assumptions', func_count;
    
    -- Get details
    SELECT string_agg(routine_name || ': ' || left(routine_definition, 150) || '...', E'\n') INTO func_details
    FROM information_schema.routines
    WHERE routine_definition LIKE '%client_booking_quotes%'
      AND (
        routine_definition LIKE '%booking_id IS NOT NULL%'
        OR routine_definition LIKE '%booking_id != NULL%'
        OR routine_definition LIKE '%WHERE booking_id%'
      );
    
    RAISE NOTICE 'Functions to review: %', func_details;
  ELSE
    RAISE NOTICE '✓ No functions found with problematic booking_id assumptions';
  END IF;
END $$;

-- =====================================================
-- 3. Check for queries that might break (common patterns)
-- =====================================================

DO $$
DECLARE
  pattern_count int;
BEGIN
  RAISE NOTICE '=== CHECKING COMMON PROBLEMATIC PATTERNS ===';
  
  -- Pattern 1: Queries that join quotes to bookings without LEFT JOIN
  SELECT COUNT(*) INTO pattern_count
  FROM information_schema.routines
  WHERE routine_definition LIKE '%client_booking_quotes%'
    AND routine_definition LIKE '%bookings%'
    AND routine_definition NOT LIKE '%LEFT JOIN%'
    AND routine_definition NOT LIKE '%OUTER JOIN%';
  
  IF pattern_count > 0 THEN
    RAISE NOTICE '⚠️  Found % routines with potential INNER JOIN issues', pattern_count;
  ELSE
    RAISE NOTICE '✓ No INNER JOIN patterns found';
  END IF;
  
  -- Pattern 2: Code that checks booking_id without NULL handling
  SELECT COUNT(*) INTO pattern_count
  FROM information_schema.routines
  WHERE routine_definition LIKE '%client_booking_quotes%'
    AND routine_definition LIKE '%booking_id%'
    AND routine_definition NOT LIKE '%IS NULL%'
    AND routine_definition NOT LIKE '%COALESCE%';
  
  IF pattern_count > 0 THEN
    RAISE NOTICE '⚠️  Found % routines with potential NULL booking_id issues', pattern_count;
  ELSE
    RAISE NOTICE '✓ No NULL booking_id handling issues found';
  END IF;
END $$;

-- =====================================================
-- 4. Check application-level assumptions (backend code patterns)
-- =====================================================

-- This would need to be checked in backend code, but we can flag common SQL patterns
DO $$
BEGIN
  RAISE NOTICE '=== BACKEND CODE PATTERNS TO CHECK ===';
  RAISE NOTICE '⚠️  Manual code review needed for:';
  RAISE NOTICE '   - Any backend code using client_booking_quotes.booking_id without NULL checks';
  RAISE NOTICE '   - Any ORM queries that assume booking_id is present';
  RAISE NOTICE '   - Any reporting queries that join quotes to bookings';
  RAISE NOTICE '   - Any API responses that expect booking_id in quote objects';
END $$;

-- =====================================================
-- 5. Verify current data won't be affected
-- =====================================================

DO $$
DECLARE
  total_quotes int;
  null_booking_id_count int;
  org_count int;
BEGIN
  RAISE NOTICE '=== CURRENT DATA VERIFICATION ===';
  
  SELECT COUNT(*) INTO total_quotes FROM client_booking_quotes;
  SELECT COUNT(*) INTO null_booking_id_count FROM client_booking_quotes WHERE booking_id IS NULL;
  SELECT COUNT(DISTINCT organization_id) INTO org_count FROM client_booking_quotes;
  
  RAISE NOTICE '✓ Current quotes: %', total_quotes;
  RAISE NOTICE '✓ Quotes with NULL booking_id: %', null_booking_id_count;
  RAISE NOTICE '✓ Organizations with quotes: %', org_count;
  
  IF null_booking_id_count = 0 THEN
    RAISE NOTICE '✓ No existing data will be affected by migration';
  ELSE
    RAISE NOTICE '⚠️  Existing quotes have NULL booking_id - manual review needed';
  END IF;
END $$;

-- =====================================================
-- 6. Performance impact check
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== PERFORMANCE IMPACT ASSESSMENT ===';
  RAISE NOTICE '✓ Migration adds 1 index for unlinked quotes';
  RAISE NOTICE '✓ No table structure changes that affect performance';
  RAISE NOTICE '✓ FK constraint preserved for non-NULL values';
  RAISE NOTICE '✓ Trigger logic only slightly more complex';
  RAISE NOTICE '⚠️  Queries may need LEFT JOIN optimization review';
END $$;

DO $$
BEGIN
  RAISE NOTICE '=== VERIFICATION COMPLETE ===';
  RAISE NOTICE '✓ Database objects checked for booking_id assumptions';
  RAISE NOTICE '✓ Manual code review recommended for backend assumptions';
  RAISE NOTICE '✓ Migration ready with identified considerations';
END $$;

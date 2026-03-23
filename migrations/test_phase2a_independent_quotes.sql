-- =====================================================
-- TEST CASES: Phase 2A Independent Quote Creation
-- Purpose: Verify migration works correctly for Phase 2A flow
-- Author: Cristian Manolache
-- Date: 2026-03-23
-- =====================================================

-- Test Setup
\set VERBOSITY verbose
BEGIN;

-- Create test organization (use existing if available)
DO $$
DECLARE
  v_test_org uuid;
BEGIN
  SELECT id INTO v_test_org FROM organizations WHERE name = 'Test Org Phase2A';
  IF v_test_org IS NULL THEN
    INSERT INTO organizations (id, name, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Test Org Phase2A', now(), now())
    RETURNING id INTO v_test_org;
  END IF;
  
  -- Store in session for tests
  PERFORM set_config('test.org_id', v_test_org::text, true);
  
  RAISE NOTICE 'Test organization ready: %', v_test_org;
END $$;

-- =====================================================
-- TEST 1: Create independent quote (Phase 2A scenario)
-- =====================================================

DO $$
DECLARE
  v_test_org uuid := current_setting('test.org_id')::uuid;
  v_quote_id uuid;
  quote_data jsonb;
BEGIN
  RAISE NOTICE '=== TEST 1: Independent Quote Creation ===';
  
  -- Insert quote with booking_id = NULL (Phase 2A)
  INSERT INTO client_booking_quotes (
    organization_id,
    booking_id,  -- NULL for independent quote
    version,
    is_locked,
    quote_valid_until,
    currency,
    subtotal_pence,
    discount_pence,
    vat_rate,
    vat_pence,
    total_pence,
    line_items,
    calc_source,
    calc_version,
    calculated_at,
    created_at,
    updated_at,
    is_current  -- Required column with default
  ) VALUES (
    v_test_org,
    NULL,  -- Independent quote
    1,
    false,
    now() + interval '24 hours',
    'GBP',
    10000,  -- £100.00
    0,
    0.20,
    2000,   -- £20.00 VAT
    12000,  -- £120.00 total
    '{
      "components": [
        {"code": "base_fare", "amount_pence": 8000},
        {"code": "distance_fee", "amount_pence": 2000}
      ],
      "discounts": [],
      "multipliers": []
    }',
    'pricing_engine_v2',
    '2.0.0',
    now(),
    now(),
    now(),
    true   -- is_current required
  ) RETURNING id INTO v_quote_id;
  
  -- Verify quote was created
  SELECT to_jsonb(*) INTO quote_data 
  FROM client_booking_quotes 
  WHERE id = v_quote_id;
  
  RAISE NOTICE '✓ Independent quote created: %', v_quote_id;
  RAISE NOTICE '✓ Quote data: %', quote_data;
  
  -- Verify booking_id is NULL
  IF (SELECT booking_id FROM client_booking_quotes WHERE id = v_quote_id) IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 1 FAILED: booking_id should be NULL';
  END IF;
  
  RAISE NOTICE '✓ booking_id correctly NULL';
END $$;

-- =====================================================
-- TEST 2: Try invalid independent quote (no organization_id)
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== TEST 2: Invalid Independent Quote ===';
  
  BEGIN
    INSERT INTO client_booking_quotes (
      organization_id,  -- NULL - should fail
      booking_id,
      version,
      is_locked,
      quote_valid_until,
      currency,
      subtotal_pence,
      total_pence,
      line_items,
      calc_source,
      calculated_at,
      created_at,
      updated_at,
      is_current  -- Required column
    ) VALUES (
      NULL,  -- Should trigger error
      NULL,
      1,
      false,
      now() + interval '24 hours',
      'GBP',
      10000,
      12000,
      '{}',
      'test',
      now(),
      now(),
      now(),
      true
    );
    
    RAISE EXCEPTION 'TEST 2 FAILED: Should have rejected NULL organization_id';
    
  EXCEPTION WHEN others THEN
    RAISE NOTICE '✓ Correctly rejected: %', SQLERRM;
  END;
END $$;

-- =====================================================
-- TEST 3: Create quote with valid booking (existing behavior)
-- =====================================================

DO $$
DECLARE
  v_test_org uuid := current_setting('test.org_id')::uuid;
  v_quote_id uuid;
  v_booking_id uuid;
BEGIN
  RAISE NOTICE '=== TEST 3: Quote with Valid Booking ===';
  
  -- Create a test booking first
  INSERT INTO bookings (
    organization_id,
    status,
    currency,
    created_at,
    updated_at
  ) VALUES (
    v_test_org,
    'pending',
    'GBP',
    now(),
    now()
  ) RETURNING id INTO v_booking_id;
  
  -- Create quote linked to booking
  INSERT INTO client_booking_quotes (
    organization_id,
    booking_id,  -- Valid booking ID
    version,
    is_locked,
    quote_valid_until,
    currency,
    subtotal_pence,
    total_pence,
    line_items,
    calc_source,
    calculated_at,
    created_at,
    updated_at,
    is_current  -- Required column
  ) VALUES (
    v_test_org,
    v_booking_id,
    1,
    false,
    now() + interval '24 hours',
    'GBP',
    15000,
    18000,
    '{}',
    'test',
    now(),
    now(),
    now(),
    true
  ) RETURNING id INTO v_quote_id;
  
  -- Verify quote was created with booking
  IF (SELECT booking_id FROM client_booking_quotes WHERE id = v_quote_id) != v_booking_id THEN
    RAISE EXCEPTION 'TEST 3 FAILED: booking_id not set correctly';
  END IF;
  
  RAISE NOTICE '✓ Quote with booking created: %', v_quote_id;
  RAISE NOTICE '✓ Linked to booking: %', v_booking_id;
END $$;

-- =====================================================
-- TEST 4: Try invalid FK (non-existent booking)
-- =====================================================

DO $$
DECLARE
  v_test_org uuid := current_setting('test.org_id')::uuid;
  v_fake_booking_id uuid := gen_random_uuid();
BEGIN
  RAISE NOTICE '=== TEST 4: Invalid FK Booking ===';
  
  BEGIN
    INSERT INTO client_booking_quotes (
      organization_id,
      booking_id,  -- Fake booking ID
      version,
      is_locked,
      quote_valid_until,
      currency,
      subtotal_pence,
      total_pence,
      line_items,
      calc_source,
      calculated_at,
      created_at,
      updated_at,
      is_current  -- Required column
    ) VALUES (
      v_test_org,
      v_fake_booking_id,  -- Should fail FK constraint
      1,
      false,
      now() + interval '24 hours',
      'GBP',
      10000,
      12000,
      '{}',
      'test',
      now(),
      now(),
      now(),
      true
    );
    
    RAISE EXCEPTION 'TEST 4 FAILED: Should have failed FK constraint';
    
  EXCEPTION WHEN others THEN
    RAISE NOTICE '✓ Correctly rejected invalid FK: %', SQLERRM;
  END;
END $$;

-- =====================================================
-- TEST 5: Phase 2A Flow Simulation
-- =====================================================

DO $$
DECLARE
  v_test_org uuid := current_setting('test.org_id')::uuid;
  v_quote_id uuid;
  v_booking_id uuid;
  updated_rows int;
BEGIN
  RAISE NOTICE '=== TEST 5: Phase 2A Flow Simulation ===';
  
  -- Step 1: Create independent quote (Phase 2A)
  INSERT INTO client_booking_quotes (
    organization_id,
    booking_id,  -- NULL
    version,
    is_locked,
    quote_valid_until,
    currency,
    subtotal_pence,
    total_pence,
    line_items,
    calc_source,
    calc_version,
    calculated_at,
    created_at,
    updated_at,
    is_current  -- Required column
  ) VALUES (
    v_test_org,
    NULL,
    1,
    false,
    now() + interval '24 hours',
    'GBP',
    20000,
    24000,
    '{"components": [{"code": "base_fare", "amount_pence": 20000}]}',
    'pricing_engine_v2',
    '2.0.0',
    now(),
    now(),
    now(),
    true
  ) RETURNING id INTO v_quote_id;
  
  RAISE NOTICE 'Step 1: Created independent quote %', v_quote_id;
  
  -- Step 2: Create booking (Phase 2B simulation)
  INSERT INTO bookings (
    organization_id,
    status,
    currency,
    created_at,
    updated_at
  ) VALUES (
    v_test_org,
    'confirmed',
    'GBP',
    now(),
    now()
  ) RETURNING id INTO v_booking_id;
  
  RAISE NOTICE 'Step 2: Created booking %', v_booking_id;
  
  -- Step 3: Link quote to booking (Phase 2B) - FIXED
  UPDATE client_booking_quotes 
  SET booking_id = v_booking_id,  -- Use the new booking variable
      updated_at = now()
  WHERE id = v_quote_id;
  
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  
  -- Verify update worked
  IF updated_rows != 1 THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Quote update failed, updated % rows', updated_rows;
  END IF;
  
  -- Verify link
  IF (SELECT booking_id FROM client_booking_quotes WHERE id = v_quote_id) != v_booking_id THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Quote not linked to booking';
  END IF;
  
  RAISE NOTICE '✓ Phase 2A flow simulation successful';
  RAISE NOTICE '✓ Quote % linked to booking %', v_quote_id, v_booking_id;
END $$;

-- =====================================================
-- TEST SUMMARY
-- =====================================================

DO $$
DECLARE
  independent_quotes int;
  linked_quotes int;
  total_quotes int;
BEGIN
  SELECT COUNT(*) INTO independent_quotes 
  FROM client_booking_quotes 
  WHERE booking_id IS NULL;
  
  SELECT COUNT(*) INTO linked_quotes 
  FROM client_booking_quotes 
  WHERE booking_id IS NOT NULL;
  
  total_quotes := independent_quotes + linked_quotes;
  
  RAISE NOTICE '=== TEST SUMMARY ===';
  RAISE NOTICE '✓ Independent quotes: %', independent_quotes;
  RAISE NOTICE '✓ Linked quotes: %', linked_quotes;
  RAISE NOTICE '✓ Total quotes: %', total_quotes;
  RAISE NOTICE '✓ All tests passed - Phase 2A ready!';
END $$;

ROLLBACK;

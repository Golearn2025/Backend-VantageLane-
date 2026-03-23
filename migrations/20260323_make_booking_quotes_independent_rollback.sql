-- =====================================================
-- ROLLBACK: Revert client_booking_quotes.booking_id to NOT NULL
-- Purpose: Rollback Phase 2A independent quote capability
-- Author: Cristian Manolache  
-- Date: 2026-03-23
-- =====================================================

-- Step 0: Safety check - ensure no NULL booking_id exist
DO $$
DECLARE
  null_quotes int;
BEGIN
  SELECT COUNT(*) INTO null_quotes FROM client_booking_quotes WHERE booking_id IS NULL;
  
  IF null_quotes > 0 THEN
    RAISE EXCEPTION 'Cannot rollback: % quotes have NULL booking_id. Clean up first.', null_quotes;
  END IF;
  
  RAISE NOTICE 'Rollback safety check passed: no NULL booking_id found';
END $$;

-- Step 1: Remove safety constraint
ALTER TABLE client_booking_quotes 
DROP CONSTRAINT IF EXISTS chk_client_booking_quotes_has_reference;

-- Step 2: Remove performance index
DROP INDEX IF EXISTS idx_client_booking_quotes_unlinked;

-- Step 3: Restore original enforce_org_matches_booking()
CREATE OR REPLACE FUNCTION enforce_org_matches_booking()
RETURNS TRIGGER AS $$
DECLARE
  booking_org uuid;
BEGIN
  SELECT b.organization_id INTO booking_org
  FROM public.bookings b
  WHERE b.id = new.booking_id;

  IF booking_org IS NULL THEN
    RAISE EXCEPTION 'Booking % not found or has null organization_id', new.booking_id
      USING errcode = '23503';
  END IF;

  IF new.organization_id IS NULL THEN
    new.organization_id := booking_org;
    RETURN new;
  END IF;

  IF new.organization_id <> booking_org THEN
    RAISE EXCEPTION 'Cross-org write blocked. organization_id % != booking.organization_id % for booking %',
      new.organization_id, booking_org, new.booking_id
      USING errcode = '23514';
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Make booking_id NOT NULL
ALTER TABLE client_booking_quotes 
ALTER COLUMN booking_id SET NOT NULL;

-- Step 5: Remove documentation
COMMENT ON COLUMN client_booking_quotes.booking_id IS NULL;
COMMENT ON TABLE client_booking_quotes IS 'Client booking quotes linked to bookings.';

-- Step 6: Verify rollback success
DO $$
DECLARE
  total_quotes int;
  null_quotes int;
  fk_check boolean;
BEGIN
  SELECT COUNT(*) INTO total_quotes FROM client_booking_quotes;
  SELECT COUNT(*) INTO null_quotes FROM client_booking_quotes WHERE booking_id IS NULL;
  
  -- Test NULL booking_id is rejected
  BEGIN
    INSERT INTO client_booking_quotes (
      organization_id, currency, subtotal_pence, total_pence,
      line_items, calc_source, calculated_at, created_at, updated_at,
      is_current  -- Required column
    ) VALUES (
      gen_random_uuid(), 'GBP', 10000, 12000,
      '{}', 'test', now(), now(), now(),
      true
    );
    DELETE FROM client_booking_quotes WHERE booking_id IS NULL;
    fk_check := false; -- NULL was allowed (bad)
  EXCEPTION WHEN others THEN
    fk_check := true; -- NULL correctly rejected (good)
  END;
  
  RAISE NOTICE 'Rollback verification:';
  RAISE NOTICE '  Total quotes: %', total_quotes;
  RAISE NOTICE '  Quotes with NULL booking_id: %', null_quotes;
  RAISE NOTICE '  NULL booking_id rejected: %', fk_check;
  
  IF fk_check = false THEN
    RAISE EXCEPTION 'NULL booking_id rejection verification failed';
  END IF;
  
  IF null_quotes > 0 THEN
    RAISE EXCEPTION 'Rollback failed: NULL booking_id still exist';
  END IF;
  
  RAISE NOTICE 'Rollback completed successfully. Phase 2A independent quote capability removed.';
END $$;

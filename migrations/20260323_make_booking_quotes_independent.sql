-- =====================================================
-- MIGRATION: Make client_booking_quotes.booking_id nullable
-- Purpose: Phase 2A - Independent quote creation before booking
-- Author: Cristian Manolache
-- Date: 2026-03-23
-- =====================================================

-- Step 0: Safety check - ensure no existing NULL booking_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM client_booking_quotes WHERE booking_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot proceed: existing quotes have NULL booking_id';
  END IF;
  
  IF (SELECT COUNT(*) FROM client_booking_quotes) > 1000 THEN
    RAISE EXCEPTION 'Too many existing quotes (%), manual review required', 
                   (SELECT COUNT(*) FROM client_booking_quotes);
  END IF;
  
  RAISE NOTICE 'Safety check passed: % existing quotes, all have booking_id', 
               (SELECT COUNT(*) FROM client_booking_quotes);
END $$;

-- Step 1: Create updated enforce_org_matches_booking() function
CREATE OR REPLACE FUNCTION enforce_org_matches_booking()
RETURNS TRIGGER AS $$
DECLARE
  booking_org uuid;
BEGIN
  -- NEW: Allow NULL booking_id for Phase 2A independent quotes
  IF new.booking_id IS NULL THEN
    -- For NULL booking_id, organization_id must be provided
    IF new.organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id is required when booking_id is NULL'
        USING errcode = '23514';
    END IF;
    
    RAISE NOTICE 'Creating independent quote for organization: %', new.organization_id;
    RETURN new;
  END IF;

  -- EXISTING: Validate booking exists and org matches (unchanged)
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

-- Step 2: Make booking_id nullable
ALTER TABLE client_booking_quotes 
ALTER COLUMN booking_id DROP NOT NULL;

-- Step 3: Add safety constraint
ALTER TABLE client_booking_quotes 
ADD CONSTRAINT chk_client_booking_quotes_has_reference 
CHECK (booking_id IS NOT NULL OR organization_id IS NOT NULL);

-- Step 4: Add documentation
COMMENT ON COLUMN client_booking_quotes.booking_id IS 
'Nullable for Phase 2A: Quotes can be created independently before booking creation.
When populated, must reference a valid booking.id via FK constraint.

Phase 2A: booking_id = NULL (independent quote)
Phase 2B: booking_id populated (linked to booking)';

COMMENT ON TABLE client_booking_quotes IS 
'Client booking quotes with independent creation capability (Phase 2A).
Quotes can exist without booking_id and be linked later during booking confirmation.';

-- Step 5: Create index for performance (quotes without booking_id)
CREATE INDEX IF NOT EXISTS idx_client_booking_quotes_unlinked 
ON client_booking_quotes (organization_id, created_at) 
WHERE booking_id IS NULL;

-- Step 6: Verify migration success
DO $$
DECLARE
  total_quotes int;
  nullable_quotes int;
  fk_check boolean;
  fake_booking_id uuid := gen_random_uuid();
BEGIN
  SELECT COUNT(*) INTO total_quotes FROM client_booking_quotes;
  SELECT COUNT(*) INTO nullable_quotes FROM client_booking_quotes WHERE booking_id IS NULL;
  
  -- Test invalid booking reference rejection (should FAIL with fake booking_id)
  BEGIN
    INSERT INTO client_booking_quotes (
      organization_id, booking_id, currency, subtotal_pence, total_pence,
      line_items, calc_source, calculated_at, created_at, updated_at,
      is_current  -- Required column
    ) VALUES (
      gen_random_uuid(), fake_booking_id, 'GBP', 10000, 12000,
      '{}', 'test', now(), now(), now(),
      true
    );
    -- If we get here, invalid reference was allowed - which is bad
    DELETE FROM client_booking_quotes WHERE booking_id = fake_booking_id;
    fk_check := false; -- Invalid reference was allowed (bad)
  EXCEPTION WHEN others THEN
    fk_check := true; -- Invalid reference correctly rejected (good)
  END;
  
  RAISE NOTICE 'Migration verification:';
  RAISE NOTICE '  Total quotes: %', total_quotes;
  RAISE NOTICE '  Quotes with NULL booking_id: %', nullable_quotes;
  RAISE NOTICE '  Invalid booking reference rejected: %', fk_check;
  
  IF fk_check = false THEN
    RAISE EXCEPTION 'Invalid booking reference rejection verification failed';
  END IF;
  
  RAISE NOTICE 'Migration completed successfully. Phase 2A ready for independent quote creation.';
END $$;

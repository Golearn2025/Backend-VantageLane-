# Phase 2B - Atomic Quote-to-Booking Conversion

## Status: ✅ COMPLETE & MERGE-READY

**Commit:** `bdf92b7` - pushed to origin/main  
**Date:** 2026-03-23  
**RPC:** `convert_quote_to_booking_atomic`

---

## Phase 2A - Independent Quotes

**Purpose:** Client-facing independent quotes without bookings

**Characteristics:**
- `booking_id = NULL` (independent)
- `is_current = true` (active)
- `vat_pence = 0` (VAT zero design)
- `vat_rate = 0` (VAT zero design)
- `line_items.meta.trip` - persisted trip metadata

**Metadata Structure:**
```json
{
  "pickup": "London Heathrow Airport",
  "dropoff": "Central London", 
  "dateTime": "2026-03-24T10:00:00Z",
  "bookingType": "one_way",
  "vehicleType": "executive",
  "distance": 15.5,
  "duration": 45,
  "hours": null,
  "days": null,
  "extras": [],
  "coordinates": null
}
```

---

## Phase 2B - Atomic Conversion

**Purpose:** Convert independent quotes to real bookings atomically

**RPC Function:** `convert_quote_to_booking_atomic`

**Parameters:**
```sql
p_quote_id UUID
p_organization_id UUID  
p_customer_id UUID
p_passenger_count INTEGER DEFAULT 1
p_bag_count INTEGER DEFAULT 0
p_notes_internal TEXT DEFAULT ''
```

**Creates:**
1. `bookings` - main booking record
2. `booking_legs` - booking legs (main leg only)
3. `client_leg_quotes` - leg pricing quotes

**Updates:**
- `client_booking_quotes.booking_id` = created booking ID
- `client_booking_quotes.is_current` = false

**Features:**
- ✅ Tenant enforcement (organization_id validation)
- ✅ Real metadata usage (no invented data)
- ✅ Enum mapping (one_way → oneway)
- ✅ Atomic transaction (PostgreSQL RPC)
- ✅ Complete rollback on error
- ✅ FK chain integrity

---

## API Endpoints

### Phase 2A - Quote Creation
```
POST /api/pricing/calculate-and-quote
```

### Phase 2B - Atomic Conversion  
```
POST /api/pricing/convert-quote-to-booking
```

---

## Database Flow

```
client_booking_quotes (independent)
        ↓ RPC atomic
bookings → booking_legs → client_leg_quotes
        ↓
client_booking_quotes (converted)
```

**Tenant Isolation:** All operations filtered by `organization_id`

---

## Testing

**Success Case:**
- Quote creation → metadata persistence
- Atomic conversion → complete FK chain
- Database verification → no orphaned data

**Failure Case:**
- Invalid quote → no partial data created
- Wrong tenant → access denied
- Missing metadata → validation error

---

## Next Phase: Phase 2C

**Focus:** Payments + Booking Confirmation Flow
- Payment validation against quotes
- Payment → booking linking
- Webhook processing
- UX integration

---

**Phase 2B is production-ready.** 🚀

# Quote Services - Architecture & Usage

## Overview

Quote services are split into focused modules for maintainability:

- **quotePersistence.service.ts** - Database persistence only
- **quoteConversion.service.ts** - Quote → Booking conversion (atomic RPC)
- **quoteRead.service.ts** - Fetching quotes
- **quoteLineItemsBuilder.ts** - Shared line items logic

---

## Critical: Phase 2A vs Phase 2B Flow

### Phase 2A: Independent Quote (booking_id = NULL)

```typescript
// 1. Calculate pricing
const pricingResult = await PricingEngine.calculate(normalizedRequest);

// 2. Create independent quote
const quoteResult = await QuotePersistenceService.createIndependentQuote(
  pricingResult,
  normalizedRequest,
  organizationId
);

// ✅ Creates: client_booking_quotes with booking_id = NULL
// ❌ Does NOT create: client_leg_quotes (no booking_legs yet)
// ✅ Per-leg truth: Stored in bookingBreakdown.legs JSON
```

**Why no `client_leg_quotes` in Phase 2A?**
- `client_leg_quotes.booking_leg_id` must reference a real `booking_legs.id`
- `booking_legs` don't exist yet (no booking created)
- Per-leg pricing stored in `client_booking_quotes.line_items.trip` metadata

---

### Phase 2B: Booking Quote (booking_id set)

```typescript
// 1. Create booking record
const booking = await createBooking(...);

// 2. Create booking_legs records
const legs = await createBookingLegs(booking.id, ...);
// Each leg now has a real booking_legs.id

// 3. Add booking_leg_id to PricingResult legs
pricingResult.legs.forEach((leg, i) => {
  leg.booking_leg_id = legs[i].id; // CRITICAL: Real ID
});

// 4. Create booking quote with leg quotes
const quoteResult = await QuotePersistenceService.createBookingQuote(
  pricingResult,
  normalizedRequest,
  organizationId,
  booking.id
);

// ✅ Creates: client_booking_quotes with booking_id set
// ✅ Creates: client_leg_quotes (one per operational leg)
// ✅ FK constraint: client_leg_quotes.booking_leg_id → booking_legs.id
```

**Critical Requirement:**
- `LegBreakdown.booking_leg_id` MUST be populated before calling `createBookingQuote()`
- If `booking_leg_id` is missing, `createLegQuote()` will throw error
- This prevents orphaned leg quotes with invented UUIDs

---

## Type Safety

### ✅ Fixed
```typescript
// OLD (wrong)
requestData: any

// NEW (correct)
requestData: NormalizedPricingRequest
```

### ✅ LegBreakdown.booking_leg_id
```typescript
export interface LegBreakdown {
  booking_leg_id?: string; // Real booking_legs.id
  // ... other fields
}
```

**Validation in createLegQuote:**
```typescript
if (!leg.booking_leg_id) {
  throw new Error('CRITICAL: leg.booking_leg_id required. booking_legs must exist first.');
}
```

---

## Line Items Builder

### buildBookingLineItems()
- Used for: Independent quotes, booking quotes
- Includes: All pricing components, multipliers, discounts
- Trip metadata: Full normalized request for Phase 2A

### buildLegLineItems()
- Used for: Per-leg quotes (Phase 2B only)
- Includes: Leg-specific components, waitingFees, multipliers
- Discount allocation: TODO (business logic TBD)

### buildTripMetadata()
- Discriminated union handler per booking type
- ONE_WAY: dropoff, additionalStops, distance, duration
- RETURN: + returnDateTime, returnPickup, returnDropoff, returnAdditionalStops
- HOURLY: hours (no distance/duration)
- DAILY: days (no distance/duration)
- FLEET: fleetConfig (vehicle counts only), distance, duration

---

## Migration from Old QuoteService

```typescript
// OLD
import { QuoteService } from '../services/QuoteService';
QuoteService.createIndependentQuote(...)

// NEW
import { QuotePersistenceService } from '../services/quotes';
QuotePersistenceService.createIndependentQuote(...)
```

See `index.ts` for full migration mapping.

---

## Common Pitfalls

### ❌ DON'T: Invent booking_leg_id
```typescript
const bookingLegId = crypto.randomUUID(); // WRONG!
```

### ✅ DO: Use real booking_legs.id
```typescript
const bookingLegId = leg.booking_leg_id; // From actual DB record
```

### ❌ DON'T: Create leg quotes in Phase 2A
```typescript
// Phase 2A - NO booking_legs yet
await createLegQuote(...); // Will fail FK constraint
```

### ✅ DO: Create leg quotes only in Phase 2B
```typescript
// Phase 2B - AFTER booking_legs created
await createBookingQuote(...); // Creates leg quotes safely
```

---

## Testing Checklist

- [ ] Phase 2A: Independent quote created without leg quotes
- [ ] Phase 2A: Trip metadata persisted correctly
- [ ] Phase 2B: Booking quote created with leg quotes
- [ ] Phase 2B: FK constraint validated (booking_leg_id → booking_legs.id)
- [ ] Phase 2B: Error thrown if booking_leg_id missing
- [ ] Quote → Booking conversion (atomic RPC)
- [ ] All booking types: ONE_WAY, RETURN, HOURLY, DAILY, FLEET

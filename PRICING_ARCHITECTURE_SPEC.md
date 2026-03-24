# PRICING ARCHITECTURE SPEC - TECHNICAL DECISIONS

**Version:** 1.1  
**Date:** 2026-03-24  
**Status:** APPROVED - Ready for Implementation  
**Changes from v1.0:** 6 critical clarifications (RETURN leg_kind, client_leg_quotes quote-stage, coordinates compat)

---

## 🎯 CORE DECISIONS

### **1. booking_type Naming**
```typescript
// ✅ ALIGNED: DB + Frontend + Backend
'oneway'   // NOT 'one_way'
'return'
'hourly'
'daily'
'fleet'
'bespoke'
```

**Action:** Backend `BookingType.ONE_WAY = 'oneway'` (change from 'one_way')

---

### **2. leg_kind vs leg_type**
```sql
-- ✅ SOURCE OF TRUTH
leg_kind ENUM ('main', 'return', 'fleet_item')

-- ⚠️ LEGACY (ignore in new code)
leg_type VARCHAR (default 'single')
```

**Action:** Use `leg_kind` exclusively. Ignore `leg_type`.

---

### **3. Per-Leg Pricing Storage**

**Strategy: USE EXISTING `client_leg_quotes` TABLE**

```
client_booking_quotes
  ├─ booking-level totals
  ├─ line_items (booking breakdown JSON)
  │   └─ includes operational_legs array for quote-stage
  └─ FK: booking_id (nullable for independent quotes)

client_leg_quotes (PER OPERATIONAL LEG)
  ├─ per-leg financial truth AFTER booking creation
  ├─ subtotal_pence, discount_pence, vat_pence, total_pence
  ├─ line_items (leg breakdown JSON)
  ├─ FK: booking_leg_id (NOT NULL - requires booking_legs to exist)
  └─ FK: booking_id (NOT NULL)

booking_legs
  ├─ operational data ONLY
  ├─ distance_miles, duration_min, route_input
  └─ NO financial columns added
```

**CRITICAL LIMITATION:** `client_leg_quotes` requires `booking_leg_id NOT NULL`, therefore:
- **Quote Stage:** Per-leg breakdown stored in `client_booking_quotes.line_items.operational_legs` JSON
- **Booking Conversion:** `client_leg_quotes` populated AFTER `booking_legs` creation

**Action:** 
1. Quote stage: Store operational legs breakdown in `client_booking_quotes.line_items`
2. Booking conversion: Populate `client_leg_quotes` for EACH operational leg

---

### **4. TripPoint Structure**

```typescript
interface TripPoint {
  placeId?: string | null;
  address: string;
  coordinates?: {
    lat: number | null;
    lng: number | null;
  };
  type?: 'address' | 'airport' | 'hotel' | 'poi';
}
```

**Action:** All location data uses `TripPoint`, not plain strings.

**Compatibility Note:** Parser MUST accept current frontend `LocationData` shape where coordinates are `[lat, lng]` array, and normalize to `TripPoint.coordinates { lat, lng }` object internally.

---

### **5. PricingRequestData Extensions**

```typescript
interface PricingRequestData {
  bookingType: 'oneway' | 'return' | 'hourly' | 'daily' | 'fleet';
  vehicleType?: VehicleType;
  dateTime: string;

  // ONE_WAY & RETURN
  pickup?: TripPoint;
  dropoff?: TripPoint;
  additionalStops?: TripPoint[];  // ✅ NEW

  // RETURN specific
  returnDateTime?: string;
  returnPickup?: TripPoint;       // ✅ NEW
  returnDropoff?: TripPoint;      // ✅ NEW
  returnAdditionalStops?: TripPoint[];  // ✅ NEW

  // HOURLY
  hours?: number;

  // DAILY
  days?: number;

  // FLEET
  fleetConfig?: Record<string, number>;

  // Compatibility (not source of truth)
  distance?: number;  // ⚠️ Compat input, backend may recompute
  duration?: number;  // ⚠️ Compat input, backend may recompute

  extras?: string[];
  organizationId?: string;
}
```

---

## 📐 BUSINESS RULES

### **ONE_WAY with Stops**

**Commercial:** 1 booking  
**Operational:** 1 leg  
**Route Segments:** Multiple (pickup → stop1 → stop2 → dropoff)

**Pricing Logic:**
```
Route: [pickup, ...additionalStops, dropoff]
Segments: pickup→stop1, stop1→stop2, stop2→dropoff

Total Distance = sum(segment distances)
Total Duration = sum(segment durations)

Price = baseFare 
      + distanceFee(totalDistance)
      + timeFee(totalDuration)
      + multiStopFee(additionalStops.length)
      + airportFee
      + extras
      - discounts
```

**Storage:**
- `booking_legs.stops_raw` = `additionalStops` as JSON array
- `booking_legs.leg_kind` = `'main'`
- `client_leg_quotes` = 1 record with full breakdown

---

### **RETURN**

**Commercial:** 1 booking  
**Operational:** 2 legs (outbound + return)

**Pricing Logic:**
```
Leg 1 (outbound): pickup → [...stops] → dropoff
Leg 2 (return):   returnPickup → [...returnStops] → returnDropoff

Booking Discount (e.g., 10%) applied at booking level
Then proportionally allocated to legs:
  leg1_discount = (leg1_subtotal / booking_subtotal) * booking_discount
  leg2_discount = (leg2_subtotal / booking_subtotal) * booking_discount
```

**Storage (aligned to current DB enum):**
- `booking_legs[0].leg_kind` = `'main'` (outbound operational leg)
- `booking_legs[1].leg_kind` = `'return'` (inbound operational leg)
- `client_leg_quotes` = 2 records (one per leg, populated at booking conversion)
- `client_booking_quotes` = 1 record with booking total + operational_legs JSON

---

### **FLEET**

**Commercial:** 1 booking  
**Operational:** N legs (1 per vehicle)

**Pricing Logic:**
```
For each vehicle in fleetConfig:
  - Calculate per-vehicle pricing
  - Apply fleet discount at booking level
  - Proportionally allocate to each vehicle leg
```

**Storage:**
- `booking_legs[i].leg_kind` = `'fleet_item'` (for fleet one-way)
- `booking_legs[i].vehicle_unit_index` = i (NEW COLUMN NEEDED)
- `client_leg_quotes` = N records (one per vehicle, at booking conversion)

**POSTPONED DECISION:** Fleet-return combinations (e.g., fleet outbound + fleet return) require additional `leg_kind` mapping design. Before implementing fleet-return:
- Confirm exact mapping for fleet outbound legs
- Confirm exact mapping for fleet return legs
- Ensure alignment with existing DB enum constraints

---

## 🔧 IMPLEMENTATION ORDER

### **Phase 1: Foundation**
1. ✅ Finalize this spec
2. Refactor `pricing.types.ts`
3. Create `validators/pricingRequestValidator.ts`
4. Create `parsers/pricingRequestParser.ts`

### **Phase 2: ONE_WAY**
5. Create `normalizers/routeNormalizer.ts`
6. Create `builders/legBuilder.ts`
7. Create `handlers/oneWayPricingHandler.ts`
8. Implement multi-stop fee calculation

### **Phase 3: Integration**
9. Adapt `PricingEngine` to orchestrate handlers
10. Adapt `QuoteService` to store operational_legs breakdown in `client_booking_quotes.line_items`
11. (Later) Populate `client_leg_quotes` at booking conversion stage

### **Phase 4: RETURN**
12. Create `handlers/returnPricingHandler.ts`
13. Implement proportional discount allocation

### **Phase 5: FLEET** (later)
14. Add `vehicle_unit_index` column to `booking_legs`
15. Create `handlers/fleetPricingHandler.ts`

---

## 🚫 OUT OF SCOPE (for now)

- ❌ EVENTS, CORPORATE, BESPOKE booking types
- ❌ Coupon/promo code system
- ❌ Frontend refactoring (comes AFTER backend is stable)
- ❌ Major DB redesign or table restructuring

**Note:** Small targeted schema additions remain allowed when strictly required (e.g., `vehicle_unit_index` for fleet tracking). Use existing tables and columns wherever possible.

---

## ✅ COMPATIBILITY NOTES

### **Frontend Adaptation (LATER)**
After backend is stable, frontend will need:
- Update `RenderPricingRequest` to include `additionalStops`
- Remove `oneway → one_way` mapping (align to `'oneway'`)
- Simplify `buildLegsPayload()` (backend becomes source of truth)
- Consume new quote response structure

### **Backward Compatibility**
- `distance` and `duration` remain optional for compatibility
- Backend may validate/recompute when route data available
- Existing `booking_type` values in DB remain valid

---

## 📊 QUOTE SNAPSHOT STRUCTURE

### **client_booking_quotes.line_items**
```json
{
  "vehicle_pricing": {
    "baseFare": 5000,
    "distanceFee": 3000,
    "timeFee": 1500,
    "multiStopFee": 500,
    "subtotal": 10000
  },
  "services": [...],
  "discounts": {
    "return_discount": -1000,
    "fleet_discount": 0
  },
  "operational_legs": [
    {
      "leg_number": 1,
      "leg_kind": "main",
      "subtotal_pence": 5000,
      "discount_pence": 500,
      "total_pence": 4500
    }
  ],
  "normalized_route_input": {
    "pickup": {...},
    "additionalStops": [...],
    "dropoff": {...}
  },
  "calc_version": "pricing_v2",
  "pricing_version_id": "uuid"
}
```

---

## 🎯 SUCCESS CRITERIA

✅ Backend pricing is single source of truth for trip interpretation  
✅ `additionalStops` fully supported in ONE_WAY  
✅ Per-leg pricing stored in `client_leg_quotes`  
✅ Booking-level discounts proportionally allocated  
✅ Quote snapshots include full auditability  
✅ No business logic duplication in frontend  

---

**APPROVED FOR IMPLEMENTATION**  
Next Step: Refactor `pricing.types.ts`

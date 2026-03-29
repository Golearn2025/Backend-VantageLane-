# Phase 1 Implementation Summary - Dual Quote Stop Pricing

**Date:** 2026-03-29  
**Status:** Core Logic Complete ✅ | Persistence Layer Pending 🚧

---

## ✅ COMPLETED WORK

### 1. Database Schema Extensions

**Migration 001: `pricing_versions`**
- ✅ Added `enable_dual_quote_stop_logic` (boolean, default false)
- ✅ Added `stop_grace_threshold_miles` (numeric, default 0.5)
- ✅ Added `stop_grace_threshold_minutes` (integer, default 5)
- ✅ Added `multi_stop_fee_pence` (integer, default 1500 - legacy £15)
- ✅ Added `stop_pricing_notes` (text, nullable)
- ✅ Applied successfully to database

**Migration 002: `client_booking_quotes`**
- ✅ Added 12 audit columns for route metrics and pricing decisions
- ✅ All columns nullable for backward compatibility
- ✅ Check constraints for data sanity
- ✅ Applied successfully to database

### 2. Type Definitions

**`src/types/pricing.types.ts`**
- ✅ Added `RouteMetrics` interface (direct/full/detour distance & duration)
- ✅ Added `DualQuotePricingLogic` interface (quotes, grace decision, strategy)
- ✅ Extended `PricingResult` with optional `routeMetrics` and `dualQuotePricing`

### 3. Service Layer

**`src/services/RouteCalculationService.ts`**
- ✅ `calculateDirectRoute()` - Calculates pickup → dropoff (ignoring stops)
- ✅ `calculateDetourMetrics()` - Compares direct vs full route

**`src/services/PricingDataService.ts`**
- ✅ `getStopGraceThreshold()` - Reads threshold from `pricing_versions`
- ✅ `isDualQuoteStopLogicEnabled()` - Checks env override + DB config
  - **Priority:** ENV override (`DISABLE_DUAL_QUOTE_STOP_LOGIC=true`) > DB config

### 4. Pricing Handler - Core Logic

**`src/handlers/oneWayPricingHandler.ts`**

✅ **Implemented `calculateDualQuoteStopPricing()` function:**
1. Calculates direct route (pickup → dropoff, no stops)
2. Calculates detour (full - direct)
3. Fetches grace threshold config
4. Calculates direct quote (no multi-stop fee)
5. Calculates full quote (with multi-stop fee)
6. Applies grace threshold logic:
   - If detour < threshold → use direct quote
   - If detour ≥ threshold → use full quote
7. Returns route metrics + pricing decision + final breakdown

✅ **Modified `calculateLegPricing()`:**
- Added `skipMultiStopFee` parameter (default false)
- Skips multi-stop fee calculation when `skipMultiStopFee = true`

✅ **Integrated into `handleOneWayPricing()`:**
- Feature flag check: `isDualQuoteStopLogicEnabled()`
- Routes to dual quote logic if enabled AND has stops
- Falls back to legacy flat fee if disabled
- Returns `routeMetrics` and `dualQuotePricing` in `PricingResult`

---

## 🚧 REMAINING WORK (Persistence Layer)

### 1. Quote Line Items Builder

**`src/services/quotes/quoteLineItemsBuilder.ts`**

**TODO:**
- [ ] Extend `LineItemMeta` interface:
  ```typescript
  interface LineItemMeta {
    trip: TripMetadata;
    calc_source: string;
    calc_version: string;
    // 🆕 NEW
    route_metrics?: {
      direct_distance_miles: number;
      direct_duration_minutes: number;
      full_distance_miles: number;
      full_duration_minutes: number;
      detour_distance_miles: number;
      detour_duration_minutes: number;
      calculation_method: string;
      calculated_at: string;
    };
    pricing_logic?: {
      direct_quote_pence: number;
      full_quote_pence: number;
      final_quote_pence: number;
      stop_grace_applied: boolean;
      grace_threshold_miles: number;
      grace_threshold_minutes: number;
      pricing_strategy: 'direct' | 'full';
      decision_reason: string;
      pricing_version_id: string;
    };
  }
  ```

- [ ] Modify `buildBookingLineItems()` signature:
  ```typescript
  export function buildBookingLineItems(
    breakdown: PricingBreakdownData,
    tripMetadata: TripMetadata,
    routeMetrics?: RouteMetrics,        // 🆕 NEW
    dualQuotePricing?: DualQuotePricingLogic  // 🆕 NEW
  ): LineItems
  ```

- [ ] Update function body to populate `meta.route_metrics` and `meta.pricing_logic`

### 2. Quote Service

**`src/services/QuoteService.ts`**

**TODO:**
- [ ] Modify `createIndependentQuote()`:
  - Extract `routeMetrics` and `dualQuotePricing` from `PricingResult`
  - Pass to `buildBookingLineItems()`
  - Persist to DB columns:
    ```typescript
    const quoteData = {
      // ... existing fields ...
      // 🆕 NEW: Route metrics columns
      direct_distance_miles: routeMetrics?.directDistance,
      direct_duration_minutes: routeMetrics?.directDuration,
      full_distance_miles: routeMetrics?.fullDistance,
      full_duration_minutes: routeMetrics?.fullDuration,
      detour_distance_miles: routeMetrics?.detourDistance,
      detour_duration_minutes: routeMetrics?.detourDuration,
      // 🆕 NEW: Pricing logic columns
      direct_quote_pence: dualQuotePricing?.directQuotePence,
      full_quote_pence: dualQuotePricing?.fullQuotePence,
      stop_grace_applied: dualQuotePricing?.stopGraceApplied,
      stop_grace_threshold_miles: dualQuotePricing?.graceThresholdMiles,
      stop_grace_threshold_minutes: dualQuotePricing?.graceThresholdMinutes,
      stop_pricing_strategy: dualQuotePricing?.pricingStrategy,
    };
    ```

- [ ] Modify `createBookingQuote()` similarly

### 3. Testing

**TODO:**
- [ ] Test legacy flow (flag OFF):
  - Verify identical behavior to current production
  - Verify multi-stop fee = £15 per stop
  - Verify no route metrics persisted

- [ ] Test new flow (flag ON):
  - Test scenario: Detour < threshold → direct quote used
  - Test scenario: Detour ≥ threshold → full quote used
  - Verify route metrics persisted correctly
  - Verify pricing logic persisted correctly
  - Verify quote → booking conversion works

- [ ] Test env override:
  - Set `DISABLE_DUAL_QUOTE_STOP_LOGIC=true`
  - Verify falls back to legacy even if DB config is enabled

---

## 📊 DECISION FLOW

```
ONE_WAY Pricing Request
         |
         v
   Has stops? ──NO──> Standard pricing (no multi-stop fee)
         |
        YES
         |
         v
   Check: isDualQuoteStopLogicEnabled()
         |
    ┌────┴────┐
    |         |
   YES       NO
    |         |
    v         v
  DUAL     LEGACY
  QUOTE    FLAT FEE
    |         |
    |         └──> £15 per stop
    |
    v
Calculate direct route
Calculate full route
Calculate detour
    |
    v
Detour < threshold?
    |
  ┌─┴─┐
 YES  NO
  |    |
  v    v
DIRECT FULL
QUOTE  QUOTE
```

---

## 🎯 CONFIGURATION

### Environment Variables
```bash
# Emergency kill switch (overrides DB config)
DISABLE_DUAL_QUOTE_STOP_LOGIC=false  # Set to 'true' to force disable
```

### Database Configuration
```sql
-- Enable dual quote logic
UPDATE pricing_versions
SET enable_dual_quote_stop_logic = true,
    stop_grace_threshold_miles = 0.5,
    stop_grace_threshold_minutes = 5,
    stop_pricing_notes = 'Phase 1: Enabled for ONE_WAY bookings'
WHERE is_active = true;

-- Verify
SELECT 
  enable_dual_quote_stop_logic,
  stop_grace_threshold_miles,
  stop_grace_threshold_minutes
FROM pricing_versions
WHERE is_active = true;
```

---

## 🚀 DEPLOYMENT PLAN

### Step 1: Deploy Migrations (DONE ✅)
```bash
# Already applied
# Migration 001: pricing_versions extensions
# Migration 002: client_booking_quotes extensions
```

### Step 2: Deploy Backend Code (IN PROGRESS 🚧)
1. ✅ Deploy type definitions
2. ✅ Deploy service layer (RouteCalculationService, PricingDataService)
3. ✅ Deploy pricing handler (oneWayPricingHandler)
4. 🚧 Deploy persistence layer (quoteLineItemsBuilder, QuoteService)
5. 🚧 Test deployment

### Step 3: Enable Feature (CONTROLLED)
```bash
# Start with flag OFF (default)
# Verify legacy behavior unchanged

# Enable for testing
UPDATE pricing_versions SET enable_dual_quote_stop_logic = true WHERE is_active = true;

# Monitor logs and metrics

# If issues arise, instant rollback:
export DISABLE_DUAL_QUOTE_STOP_LOGIC=true
pm2 restart backend
```

---

## 📝 NOTES

### Known Lint Warnings (Non-Blocking)
- Pre-existing type incompatibility between `TripPoint.coordinates` and `PricingRequestData`
- These are legacy issues that don't affect dual quote functionality
- Can be addressed in a separate type cleanup task

### Source of Truth
- **Phase 1:** Route metrics and pricing logic are source of truth in `client_booking_quotes`
- **Bookings:** `trip_configuration_raw` contains only `meta.trip` (not route_metrics/pricing_logic)
- **Access pattern:** JOIN with `client_booking_quotes` to get route metrics for a booking

### Out of Scope (Phase 1)
- ❌ RETURN booking type (uses legacy flat fee)
- ❌ HOURLY/DAILY/FLEET booking types
- ❌ Frontend UI changes
- ❌ Admin panel for threshold configuration
- ❌ Performance indexes (Migration 003 deferred)
- ❌ RPC modifications
- ❌ Bookings table extensions

---

## 🔧 NEXT STEPS

1. **Complete persistence layer** (quoteLineItemsBuilder + QuoteService)
2. **Test both flows** (legacy + dual quote)
3. **Deploy with flag OFF**
4. **Enable flag ON** for controlled rollout
5. **Monitor metrics:**
   - Grace application rate
   - Average detour distance/duration
   - Quote comparison (direct vs full)
   - Customer impact

---

**Implementation Progress:** ~75% Complete  
**Estimated Remaining:** 2-3 hours (persistence + testing)


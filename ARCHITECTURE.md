# Vantage Lane Pricing System Architecture

## Overview

The Vantage Lane pricing system has been refactored to align with a normalized database architecture, implementing a complete write pipeline for quotes and financial snapshots.

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT REQUEST                              │
│                    POST /api/pricing/calculate                      │
│                POST /api/pricing/calculate-with-commissions         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PRICING CONTROLLER                             │
│                   PricingController.ts                              │
│  - Validates request                                                │
│  - Fetches organization settings (commission rates, VAT)            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PRICING ENGINE                                │
│                     PricingEngine.ts                                │
│  - Orchestrates calculation pipeline                                │
│  - Delegates to FeeCalculators and BookingTypeHandlers              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE VIEWS (READ)                            │
│                   PricingDataService.ts                             │
│                                                                     │
│  ├─ v_pricing_vehicle_rates      (base fare, per mile, per min)   │
│  ├─ v_pricing_hourly_rules       (hourly rates, min/max hours)    │
│  ├─ v_pricing_daily_rules        (daily rates, hours per day)     │
│  ├─ v_pricing_time_rules         (multipliers for time periods)   │
│  ├─ v_pricing_airport_fees       (airport pickup/dropoff fees)    │
│  ├─ v_pricing_zone_fees          (congestion, ULEZ, tolls)        │
│  └─ v_pricing_rounding_rules     (rounding policy)                │
│                                                                     │
│  Cache: 5 minutes TTL                                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FEE CALCULATORS                                  │
│                   FeeCalculators.ts                                 │
│                                                                     │
│  Sequential calculation:                                            │
│  1. Base fare (if not hourly/daily)                               │
│  2. Main fare:                                                     │
│     - Hourly fee (for hourly bookings)                            │
│     - Daily fee (for daily bookings)                              │
│     - Distance + Time fee (for one_way/return/fleet)              │
│  3. Zone fees (airports, congestion)                              │
│  4. Toll fees (dartford, m6)                                      │
│  5. Additional services (multi-stop, extras)                      │
│  6. Calculate subtotal                                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 BOOKING TYPE HANDLERS                               │
│                BookingTypeHandlers.ts                               │
│                                                                     │
│  ├─ RETURN: Double subtotal, apply 10% discount                   │
│  └─ FLEET: Calculate per vehicle, apply tier discount             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              MULTIPLIERS & DISCOUNTS                                │
│                                                                     │
│  ├─ Time multipliers (night, peak, weekend)                       │
│  ├─ Corporate discounts (tier1, tier2)                            │
│  ├─ Minimum fare check                                            │
│  └─ Rounding (to nearest £5)                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PRICING RESULT                                   │
│                                                                     │
│  {                                                                  │
│    finalPrice: number,                                             │
│    breakdown: {...},                                               │
│    legs: [...],        // for RETURN/FLEET                        │
│    fleet_summary: [...] // for FLEET only                         │
│  }                                                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              ORGANIZATION SETTINGS (READ)                           │
│            OrganizationSettingsService.ts                           │
│                                                                     │
│  Fetches from: organization_settings table                         │
│  - platform_commission_pct (default 10%)                           │
│  - operator_commission_pct (default 10%)                           │
│  - vat_rate (default 20% UK VAT)                                   │
│  - currency (GBP)                                                   │
│                                                                     │
│  Cache: 5 minutes TTL                                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   VAT & COMMISSION CALCULATION                      │
│                                                                     │
│  priceBeforeVAT = finalPrice                                       │
│  vatAmount = priceBeforeVAT × vat_rate                             │
│  priceWithVAT = priceBeforeVAT + vatAmount                         │
│                                                                     │
│  platformFee = priceBeforeVAT × platform_commission_pct            │
│  operatorNet = priceBeforeVAT - platformFee                        │
│  operatorCommission = operatorNet × operator_commission_pct        │
│  driverPayout = operatorNet - operatorCommission                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    QUOTE PERSISTENCE (WRITE)                        │
│                      QuoteService.ts                                │
│                                                                     │
│  Step 1: Create leg quotes                                         │
│  ├─ INSERT INTO client_leg_quotes                                 │
│  │  - One row per leg (for RETURN/FLEET bookings)                 │
│  │  - Stores: pricing breakdown, commissions                      │
│  │  - All amounts in pence                                        │
│  │  - Status: 'pending'                                           │
│  │                                                                 │
│  Step 2: Create booking quote                                      │
│  └─ INSERT INTO client_booking_quotes                             │
│     - Aggregated quote for entire booking                         │
│     - Links to leg_quote_ids                                      │
│     - Stores: request data, pricing breakdown, fleet summary      │
│     - Valid for 24 hours                                          │
│     - Status: 'pending'                                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API RESPONSE                                   │
│                                                                     │
│  {                                                                  │
│    ...pricingResult,                                               │
│    quote_id: "uuid",                                               │
│    leg_quote_ids: ["uuid1", "uuid2"],                             │
│    pricing: {                                                      │
│      priceBeforeVAT, vatAmount, priceWithVAT                      │
│    },                                                              │
│    commissions: {                                                  │
│      platformFee, operatorNet, driverPayout                       │
│    }                                                               │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                        BOOKING CONFIRMATION
═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                    CUSTOMER CONFIRMS QUOTE                          │
│                  POST /api/booking/confirm                          │
│                                                                     │
│  Request body:                                                      │
│  {                                                                  │
│    quoteId: "uuid",                                                │
│    bookingId: "uuid",                                              │
│    organizationId: "uuid"                                          │
│  }                                                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BOOKING CONTROLLER                               │
│                   BookingController.ts                              │
│                                                                     │
│  1. Update quote status to 'accepted'                              │
│  2. Trigger financial snapshot creation                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              FINANCIAL SNAPSHOT SERVICE                             │
│            FinancialSnapshotService.ts                              │
│                                                                     │
│  Fetches:                                                           │
│  - Quote data (from client_booking_quotes)                         │
│  - Organization settings (commission rates, VAT)                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   LINE ITEMS CREATION (WRITE)                       │
│                                                                     │
│  INSERT INTO booking_line_items                                    │
│  Creates individual line items:                                    │
│  ├─ Base fare                                                      │
│  ├─ Distance fee                                                   │
│  ├─ Time fee                                                       │
│  ├─ Additional fees (airport/zone/toll)                           │
│  ├─ Services (multi-stop, extras)                                 │
│  ├─ Discounts (negative amount)                                   │
│  └─ VAT (calculated from organization settings)                   │
│                                                                     │
│  Each line item:                                                    │
│  - booking_id                                                       │
│  - item_type                                                        │
│  - description                                                      │
│  - amount_pence                                                     │
│  - quantity                                                         │
│  - is_taxable                                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              LEG FINANCIAL SNAPSHOTS (WRITE)                        │
│                                                                     │
│  INSERT INTO internal_leg_financials                               │
│  One row per leg (for RETURN/FLEET bookings)                       │
│                                                                     │
│  Stores IMMUTABLE snapshot:                                         │
│  ├─ customer_price_pence (with VAT)                               │
│  ├─ price_before_vat_pence                                        │
│  ├─ vat_amount_pence                                              │
│  ├─ vat_rate (locked at booking time)                             │
│  ├─ platform_fee_pence                                            │
│  ├─ platform_commission_pct (locked)                              │
│  ├─ operator_net_pence                                            │
│  ├─ operator_commission_pence                                     │
│  ├─ operator_commission_pct (locked)                              │
│  └─ driver_payout_pence                                           │
│                                                                     │
│  Purpose: Driver payout calculation, accounting                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│            BOOKING FINANCIAL SNAPSHOT (WRITE)                       │
│                                                                     │
│  INSERT INTO internal_booking_financials                           │
│  One row per booking (aggregated)                                  │
│                                                                     │
│  Stores IMMUTABLE snapshot:                                         │
│  ├─ customer_price_pence (with VAT)                               │
│  ├─ price_before_vat_pence                                        │
│  ├─ vat_amount_pence                                              │
│  ├─ vat_rate (locked at booking time)                             │
│  ├─ platform_fee_pence                                            │
│  ├─ platform_commission_pct (locked)                              │
│  ├─ operator_net_pence                                            │
│  ├─ operator_commission_pence                                     │
│  ├─ operator_commission_pct (locked)                              │
│  ├─ driver_payout_pence                                           │
│  └─ leg_financial_ids (array of UUIDs)                            │
│                                                                     │
│  Purpose: Accounting, revenue reporting, reconciliation            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CONFIRMATION RESPONSE                          │
│                                                                     │
│  {                                                                  │
│    success: true,                                                  │
│    booking_id: "uuid",                                             │
│    quote_id: "uuid",                                               │
│    booking_financial_id: "uuid",                                   │
│    leg_financial_ids: ["uuid1", "uuid2"],                         │
│    line_item_ids: ["uuid1", "uuid2", ...]                         │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Pricing Engine (`PricingEngine.ts`)
- **Role:** Orchestrator
- **Reads from:** Database views via `PricingDataService`
- **Delegates to:** `FeeCalculators`, `BookingTypeHandlers`
- **Returns:** `PricingResult` with breakdown and legs

### 2. Fee Calculators (`FeeCalculators.ts`)
- **Role:** Individual fee calculation methods
- **Methods:**
  - `calculateBaseFare()` - reads from `v_pricing_vehicle_rates`
  - `calculateHourlyFee()` - reads from `v_pricing_hourly_rules`
  - `calculateDailyFee()` - reads from `v_pricing_daily_rules`
  - `calculateDistanceFee()` - tiered pricing (first 6 miles vs after)
  - `calculateTimeFee()` - per minute pricing
  - `calculateZoneFees()` - airports, congestion zones
  - `calculateTollFees()` - dartford, m6
  - `applyMultipliers()` - time-based surcharges
  - `applyDiscounts()` - corporate discounts
  - `applyMinimumFare()` - minimum fare enforcement

### 3. Booking Type Handlers (`BookingTypeHandlers.ts`)
- **Role:** Special logic for RETURN and FLEET bookings
- **Methods:**
  - `applyReturnTripLogic()` - doubles subtotal, applies 10% discount
  - `applyFleetLogic()` - calculates per vehicle, tier discounts
  - `generateReturnLegs()` - creates 2 legs (outbound + return)
  - `generateFleetLegs()` - creates N legs (one per vehicle)

### 4. Pricing Data Service (`PricingDataService.ts`)
- **Role:** Data access layer for pricing configuration
- **Reads from:** Database views (read-only)
- **Cache:** 5 minutes TTL
- **Methods:**
  - `getVehicleRates(vehicleType, bookingType)`
  - `getHourlyRules(vehicleType)`
  - `getDailyRules(vehicleType)`
  - `getTimeRules()`
  - `getAirportFee(airportCode)`
  - `getZoneFee(zoneCode)`
  - `getRoundingRules()`

### 5. Organization Settings Service (`OrganizationSettingsService.ts`)
- **Role:** Fetch organization-specific settings
- **Reads from:** `organization_settings` table
- **Cache:** 5 minutes TTL
- **Provides:**
  - Platform commission percentage
  - Operator commission percentage
  - VAT rate
  - Currency
  - Timezone

### 6. Quote Service (`QuoteService.ts`)
- **Role:** Persist pricing quotes to database
- **Writes to:**
  - `client_leg_quotes` - individual leg quotes
  - `client_booking_quotes` - aggregated booking quote
- **Methods:**
  - `createQuote()` - creates complete quote structure
  - `getQuote(quoteId)` - retrieves quote with legs
  - `updateQuoteStatus()` - updates quote status

### 7. Financial Snapshot Service (`FinancialSnapshotService.ts`)
- **Role:** Create immutable financial snapshots on booking confirmation
- **Writes to:**
  - `booking_line_items` - itemized breakdown
  - `internal_leg_financials` - per-leg financial snapshot
  - `internal_booking_financials` - aggregated financial snapshot
- **Methods:**
  - `createFinancialSnapshot()` - creates complete snapshot
  - `getBookingFinancials()` - retrieves snapshot

## Database Tables

### Read Operations (Views)
- `v_pricing_vehicle_rates` - base fare, per mile, per minute rates
- `v_pricing_hourly_rules` - hourly rates and limits
- `v_pricing_daily_rules` - daily rates and limits
- `v_pricing_time_rules` - time-based multipliers
- `v_pricing_airport_fees` - airport pickup/dropoff fees
- `v_pricing_zone_fees` - congestion, ULEZ, toll fees
- `v_pricing_rounding_rules` - rounding policy
- `organization_settings` - commission rates, VAT, currency

### Write Operations (Tables)
- `client_leg_quotes` - individual leg quotes
- `client_booking_quotes` - aggregated booking quotes
- `booking_line_items` - itemized price breakdown
- `internal_leg_financials` - immutable leg financial snapshots
- `internal_booking_financials` - immutable booking financial snapshots

## API Endpoints

### Pricing Endpoints
- `POST /api/pricing/calculate` - Calculate price, persist quote
- `POST /api/pricing/calculate-with-commissions` - Calculate with VAT and commissions
- `GET /api/pricing/health` - Health check

### Booking Endpoints
- `POST /api/booking/confirm` - Confirm booking, create financial snapshot
- `GET /api/booking/:bookingId/financials` - Get booking financial snapshot

### Configuration Endpoints
- `GET /api/config/vehicle-types` - Get available vehicle types
- `GET /api/config/booking-types` - Get available booking types

### Cache Management
- `POST /api/cache/invalidate` - Invalidate pricing cache
- `GET /api/cache/status` - Get cache status

## Data Flow Summary

1. **Quote Generation:**
   - Client requests price → PricingEngine calculates → QuoteService persists → Return quote_id

2. **Booking Confirmation:**
   - Client confirms quote → BookingController validates → FinancialSnapshotService creates snapshots → Return financial IDs

3. **Financial Snapshots:**
   - Immutable records locked at booking time
   - Used for driver payouts, accounting, reconciliation
   - Cannot be modified after creation

## Multi-Tenant Support

- Organization ID passed via request body or header (`x-organization-id`)
- Commission rates and VAT fetched from `organization_settings` per organization
- Supports different pricing rules per organization (via database views)
- Quotes and financials tagged with `organization_id`

## Key Improvements

✅ **Single pricing engine** - Removed dual implementation  
✅ **Single source of truth** - Database views only  
✅ **Quote persistence** - All quotes saved to database  
✅ **Financial snapshots** - Immutable records for accounting  
✅ **Configurable VAT** - Per organization VAT rates  
✅ **Configurable commissions** - Platform and operator rates from DB  
✅ **Multi-tenant ready** - Organization-specific settings  
✅ **Audit trail** - Complete history of quotes and financials  

## Removed Components

❌ Legacy `PricingEngine.ts` (JSONB-based)  
❌ Legacy `FeeCalculators.ts` (JSONB-based)  
❌ Legacy `BookingTypeHandlers.ts` (JSONB-based)  
❌ `PricingConfigService.ts` (JSONB config fetcher)  
❌ `PricingConfigAdapter.ts` (JSONB to TypeScript converter)  
❌ `admin.ts` routes (local JSON file storage)  
❌ `pricing.config.ts` (hardcoded TypeScript config)  

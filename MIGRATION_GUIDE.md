# Migration Guide: Legacy to Normalized Pricing System

## Overview

This guide documents the migration from the legacy JSONB-based pricing system to the new normalized database architecture with complete write pipeline support.

## What Changed

### Removed Components

1. **Legacy Pricing Engine Files**
   - ❌ `src/services/PricingEngine.ts` (JSONB-based)
   - ❌ `src/services/FeeCalculators.ts` (JSONB-based)
   - ❌ `src/services/BookingTypeHandlers.ts` (JSONB-based)
   - ❌ `src/services/PricingConfigService.ts`
   - ❌ `src/services/PricingConfigAdapter.ts`

2. **Legacy Configuration**
   - ❌ `src/config/pricing.config.ts` (hardcoded TypeScript config)
   - ❌ `src/routes/admin.ts` (local JSON file storage)

3. **Legacy Database Approach**
   - ❌ Reading from `pricing_config` table (JSONB columns)
   - ❌ No quote persistence
   - ❌ No financial snapshots

### New Components

1. **Pricing Engine** (from `*New.ts` files)
   - ✅ `src/services/PricingEngine.ts` (normalized views)
   - ✅ `src/services/FeeCalculators.ts` (async, view-based)
   - ✅ `src/services/BookingTypeHandlers.ts` (async, view-based)
   - ✅ `src/services/PricingDataService.ts` (view reader with cache)

2. **New Services**
   - ✅ `src/services/OrganizationSettingsService.ts` - Commission & VAT configuration
   - ✅ `src/services/QuoteService.ts` - Quote persistence
   - ✅ `src/services/FinancialSnapshotService.ts` - Financial snapshots

3. **New Controllers & Routes**
   - ✅ `src/controllers/BookingController.ts` - Booking confirmation
   - ✅ `src/routes/booking.ts` - Booking endpoints

4. **New Database Operations**
   - ✅ Write to `client_leg_quotes`
   - ✅ Write to `client_booking_quotes`
   - ✅ Write to `booking_line_items`
   - ✅ Write to `internal_leg_financials`
   - ✅ Write to `internal_booking_financials`

## Database Requirements

### Required Tables

The following tables must exist in your Supabase database:

1. **organization_settings**
   ```sql
   - organization_id (uuid, primary key)
   - platform_commission_pct (numeric, default 0.10)
   - operator_commission_pct (numeric, default 0.10)
   - vat_rate (numeric, default 0.20)
   - currency (text, default 'GBP')
   - timezone (text, default 'Europe/London')
   - is_active (boolean, default true)
   ```

2. **organizations**
   ```sql
   - id (uuid, primary key)
   - name (text)
   - is_active (boolean, default true)
   ```

3. **client_leg_quotes**
   ```sql
   - id (uuid, primary key)
   - organization_id (uuid)
   - leg_number (integer)
   - leg_type (text) -- 'outbound', 'return', 'vehicle'
   - vehicle_category (text)
   - vehicle_index (integer)
   - pickup_location (text)
   - destination (text)
   - scheduled_at (timestamptz)
   - distance_miles (numeric)
   - duration_min (integer)
   - base_fare_pence (integer)
   - distance_fee_pence (integer)
   - time_fee_pence (integer)
   - airport_fees_pence (integer)
   - zone_fees_pence (integer)
   - toll_fees_pence (integer)
   - extra_services_pence (integer)
   - subtotal_pence (integer)
   - leg_price_pence (integer)
   - platform_fee_pence (integer)
   - operator_net_pence (integer)
   - driver_payout_pence (integer)
   - quote_status (text, default 'pending')
   - created_at (timestamptz)
   ```

4. **client_booking_quotes**
   ```sql
   - id (uuid, primary key)
   - organization_id (uuid)
   - booking_type (text)
   - vehicle_type (text)
   - pickup_location (text)
   - dropoff_location (text)
   - scheduled_at (timestamptz)
   - distance_km (numeric)
   - duration_min (integer)
   - hours (integer)
   - days (integer)
   - extras (jsonb)
   - corporate_tier (text)
   - fleet_config (jsonb)
   - base_fare_pence (integer)
   - distance_fee_pence (integer)
   - time_fee_pence (integer)
   - additional_fees_pence (integer)
   - services_pence (integer)
   - subtotal_pence (integer)
   - discounts_pence (integer)
   - final_price_pence (integer)
   - multipliers (jsonb)
   - fleet_summary (jsonb)
   - leg_quote_ids (uuid[])
   - currency (text, default 'GBP')
   - quote_status (text, default 'pending')
   - valid_until (timestamptz)
   - created_at (timestamptz)
   ```

5. **booking_line_items**
   ```sql
   - id (uuid, primary key)
   - booking_id (uuid)
   - item_type (text)
   - description (text)
   - amount_pence (integer)
   - quantity (integer, default 1)
   - is_taxable (boolean, default true)
   - created_at (timestamptz)
   ```

6. **internal_leg_financials**
   ```sql
   - id (uuid, primary key)
   - booking_id (uuid)
   - leg_quote_id (uuid)
   - leg_number (integer)
   - leg_type (text)
   - customer_price_pence (integer)
   - price_before_vat_pence (integer)
   - vat_amount_pence (integer)
   - vat_rate (numeric)
   - platform_fee_pence (integer)
   - platform_commission_pct (numeric)
   - operator_net_pence (integer)
   - operator_commission_pence (integer)
   - operator_commission_pct (numeric)
   - driver_payout_pence (integer)
   - currency (text, default 'GBP')
   - snapshot_created_at (timestamptz)
   ```

7. **internal_booking_financials**
   ```sql
   - id (uuid, primary key)
   - booking_id (uuid)
   - booking_quote_id (uuid)
   - customer_price_pence (integer)
   - price_before_vat_pence (integer)
   - vat_amount_pence (integer)
   - vat_rate (numeric)
   - platform_fee_pence (integer)
   - platform_commission_pct (numeric)
   - operator_net_pence (integer)
   - operator_commission_pence (integer)
   - operator_commission_pct (numeric)
   - driver_payout_pence (integer)
   - leg_financial_ids (uuid[])
   - currency (text, default 'GBP')
   - snapshot_created_at (timestamptz)
   ```

### Required Views

The following views must exist (referenced by `PricingDataService`):

1. **v_active_pricing_version** - Active pricing version settings
2. **v_pricing_vehicle_rates** - Vehicle rates by type and booking type
3. **v_pricing_hourly_rules** - Hourly booking rules
4. **v_pricing_daily_rules** - Daily booking rules
5. **v_pricing_time_rules** - Time-based multipliers
6. **v_pricing_airport_fees** - Airport fees
7. **v_pricing_zone_fees** - Zone fees (congestion, ULEZ, tolls)
8. **v_pricing_rounding_rules** - Rounding policy

## API Changes

### Pricing Endpoints (Modified)

**Before:**
```typescript
POST /api/pricing/calculate
Response: { finalPrice, breakdown, ... }
```

**After:**
```typescript
POST /api/pricing/calculate
Response: { 
  finalPrice, 
  breakdown, 
  quote_id,           // NEW: Quote ID
  leg_quote_ids,      // NEW: Leg quote IDs
  ...
}
```

**Before:**
```typescript
POST /api/pricing/calculate-with-commissions
Response: { 
  finalPrice, 
  commissions: { platformFee, operatorNet, driverPayout }
}
```

**After:**
```typescript
POST /api/pricing/calculate-with-commissions
Response: { 
  finalPrice, 
  quote_id,           // NEW: Quote ID
  leg_quote_ids,      // NEW: Leg quote IDs
  pricing: {          // NEW: VAT breakdown
    priceBeforeVAT,
    vatAmount,
    vatRate,
    priceWithVAT
  },
  commissions: {      // MODIFIED: Fetched from DB
    platformFee,
    platformCommissionPct,
    operatorNet,
    operatorCommission,
    operatorCommissionPct,
    driverPayout
  }
}
```

### New Endpoints

```typescript
POST /api/booking/confirm
Request: {
  quoteId: string,
  bookingId: string,
  organizationId?: string
}
Response: {
  success: true,
  booking_id: string,
  quote_id: string,
  booking_financial_id: string,
  leg_financial_ids: string[],
  line_item_ids: string[]
}
```

```typescript
GET /api/booking/:bookingId/financials
Response: {
  success: true,
  data: {
    // Complete financial snapshot
    customer_price_pence,
    vat_amount_pence,
    platform_fee_pence,
    driver_payout_pence,
    leg_financials: [...]
  }
}
```

### Removed Endpoints

- ❌ All `/api/admin/*` endpoints (legacy admin panel)

## Environment Variables

No new environment variables required. Existing variables remain:

```bash
PORT=3000
NODE_ENV=production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
FRONTEND_URL=https://your-frontend.com
```

## Migration Steps

### 1. Database Setup

1. Create all required tables (see Database Requirements above)
2. Create all required views
3. Insert default organization settings:
   ```sql
   INSERT INTO organization_settings (
     organization_id,
     platform_commission_pct,
     operator_commission_pct,
     vat_rate,
     currency,
     timezone
   ) VALUES (
     'default-org-id',
     0.10,  -- 10% platform commission
     0.10,  -- 10% operator commission
     0.20,  -- 20% UK VAT
     'GBP',
     'Europe/London'
   );
   ```

### 2. Code Deployment

1. Pull latest code
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Deploy to production

### 3. Testing

1. Test pricing calculation:
   ```bash
   curl -X POST http://localhost:3000/api/pricing/calculate \
     -H "Content-Type: application/json" \
     -d '{
       "pickup": "London Heathrow",
       "dropoff": "Central London",
       "vehicleType": "executive",
       "bookingType": "one_way",
       "dateTime": "2024-03-15T10:00:00Z",
       "distance": 25,
       "duration": 45
     }'
   ```

2. Test booking confirmation:
   ```bash
   curl -X POST http://localhost:3000/api/booking/confirm \
     -H "Content-Type: application/json" \
     -d '{
       "quoteId": "quote-uuid-from-step-1",
       "bookingId": "new-booking-uuid",
       "organizationId": "default-org-id"
     }'
   ```

3. Verify financial snapshot:
   ```bash
   curl http://localhost:3000/api/booking/new-booking-uuid/financials
   ```

### 4. Frontend Integration

Update frontend to:

1. Store `quote_id` from pricing response
2. Send `quote_id` when confirming booking
3. Display VAT breakdown in pricing UI
4. Show commission breakdown (if admin)

## Rollback Plan

If issues occur, you can rollback by:

1. Revert to previous git commit
2. Redeploy previous version
3. Legacy `pricing_config` table remains untouched

## Support

For issues or questions:
- Check `ARCHITECTURE.md` for system flow
- Review logs in Supabase dashboard
- Check cache status: `GET /api/cache/status`

## Benefits of New System

✅ **Complete audit trail** - All quotes and financials persisted  
✅ **Immutable financial records** - Snapshots locked at booking time  
✅ **Multi-tenant support** - Organization-specific settings  
✅ **Configurable VAT** - Per-organization VAT rates  
✅ **Configurable commissions** - Database-driven commission rates  
✅ **Driver payout tracking** - Accurate payout calculations  
✅ **Accounting integration** - Line items for financial systems  
✅ **Price history** - Track pricing changes over time  
✅ **Single source of truth** - Database views only  

# Vantage Lane Pricing System - Testing Guide

## Overview

This guide explains how to test the complete pricing system end-to-end, including pricing calculation, VAT, commissions, quote persistence, and financial snapshots.

## Prerequisites

1. **Backend server running:**
   ```bash
   npm run dev
   ```

2. **Database configured:**
   - Supabase project set up
   - All required tables exist
   - All required views exist
   - Organization settings configured

3. **Node.js dependencies:**
   ```bash
   npm install axios
   ```

## Test Suites

### 1. Main Functional Test Suite

**File:** `pricing-test-runner.js`

**Purpose:** Tests all 8 core pricing scenarios with full pipeline verification.

**Run:**
```bash
node pricing-test-runner.js
```

**Tests:**
1. ✅ Short city trip (5km, 15min)
2. ✅ Medium city trip (20km, 35min)
3. ✅ Long distance trip (120km, 120min)
4. ✅ Hourly booking (4 hours)
5. ✅ Daily booking (2 days)
6. ✅ Airport transfer (LHR to Central London)
7. ✅ Return trip (2 legs)
8. ✅ Fleet booking (3 vehicles)

**What it verifies:**
- ✅ Pricing calculation correctness
- ✅ VAT calculation (20% UK VAT)
- ✅ Platform commission (10%)
- ✅ Operator commission (10%)
- ✅ Driver payout calculation
- ✅ Quote persistence (`client_leg_quotes`, `client_booking_quotes`)
- ✅ Booking confirmation
- ✅ Financial snapshot creation (`booking_line_items`, `internal_leg_financials`, `internal_booking_financials`)
- ✅ Quote ID propagation through pipeline
- ✅ Leg generation (for return/fleet bookings)

**Output:**
```
┌────┬─────────────────────────────────────┬────────┬──────────┬──────────┬──────────┬──────────┐
│ #  │ Scenario                            │ Status │ Price    │ VAT      │ Platform │ Driver   │
├────┼─────────────────────────────────────┼────────┼──────────┼──────────┼──────────┼──────────┤
│ 1  │ Short City Trip (5km, 15min)        │ ✅ PASS│ £25.50   │ £4.25    │ £2.13    │ £19.13   │
│ 2  │ Medium City Trip (20km, 35min)      │ ✅ PASS│ £45.00   │ £7.50    │ £3.75    │ £33.75   │
...
```

---

### 2. Critical Edge Case Tests

**File:** `pricing-critical-tests.js`

**Purpose:** Tests edge cases that commonly cause production bugs in ride-hailing platforms.

**Run:**
```bash
node pricing-critical-tests.js
```

**Tests:**

#### Test 1: Rounding Precision
**What it catches:** VAT and commission rounding errors

**Common bug:**
```
priceBeforeVAT = £21.33
vatAmount = £4.27 (calculated as 21.33 × 0.20 = 4.266, rounded to 4.27)
priceWithVAT = £25.60 (should be 21.33 + 4.27 = 25.60) ✅

BUT if rounding is done incorrectly:
priceWithVAT = £25.59 or £25.61 ❌
```

**Verification:**
- `|priceBeforeVAT + vatAmount - priceWithVAT| < £0.01`
- `|platformFee + operatorNet - priceBeforeVAT| < £0.01`
- `|operatorCommission + driverPayout - operatorNet| < £0.01`

#### Test 2: Minimum Fare Edge Case
**What it catches:** Negative driver payout when minimum fare is applied

**Common bug:**
```
Calculated price: £3.50
Minimum fare: £10.00
Price after minimum: £10.00

Wrong approach:
platformFee = £3.50 × 10% = £0.35 (calculated on £3.50)
operatorNet = £10.00 - £0.35 = £9.65
driverPayout = £9.65 - £0.97 = £8.68 ✅

Correct approach:
platformFee = £10.00 × 10% = £1.00 (calculated on £10.00)
operatorNet = £10.00 - £1.00 = £9.00
driverPayout = £9.00 - £0.90 = £8.10 ✅
```

**Verification:**
- Driver payout > 0
- All commission amounts are positive
- Commissions calculated on final price (after minimum fare)

#### Test 3: Pence Precision
**What it catches:** Precision loss when converting between pounds and pence

**Common bug:**
```
Price in pounds: £12.345
Convert to pence: 1234.5p → rounded to 1235p
Convert back: 1235p → £12.35

Lost: £0.005 ❌
```

**Verification:**
- All prices properly rounded to 2 decimal places
- No precision loss when converting to pence and back
- All stored values are whole pence (no fractional pence)

---

## Test Execution Flow

### Step 1: Start Backend
```bash
cd /Users/kkk/CascadeProjects/Vantage-Lane-Backend-Pricing
npm run dev
```

**Expected output:**
```
🚗 Vantage Lane Pricing Backend running on port 3000
📊 Health check: http://localhost:3000/health
💰 Pricing API: http://localhost:3000/api/pricing
```

### Step 2: Run Main Test Suite
```bash
node pricing-test-runner.js
```

**Expected duration:** 30-60 seconds (8 tests)

**Success criteria:**
- All 8 tests pass
- All quote IDs generated
- All booking confirmations successful
- All financial snapshots created

### Step 3: Run Critical Tests
```bash
node pricing-critical-tests.js
```

**Expected duration:** 10-20 seconds (3 tests)

**Success criteria:**
- All 3 critical tests pass
- No rounding errors detected
- No negative payouts
- No precision loss

---

## Manual Testing

### Test Pricing Endpoint

```bash
curl -X POST http://localhost:3000/api/pricing/calculate-with-commissions \
  -H "Content-Type: application/json" \
  -d '{
    "pickup": "Central London",
    "dropoff": "Heathrow Airport",
    "vehicleType": "executive",
    "bookingType": "one_way",
    "dateTime": "2024-03-15T10:00:00Z",
    "distance": 25,
    "duration": 45,
    "organizationId": "9a5caade-4791-4860-93b5-c704eb580223"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "finalPrice": 45.00,
  "currency": "GBP",
  "quote_id": "uuid-here",
  "leg_quote_ids": [],
  "pricing": {
    "priceBeforeVAT": 37.50,
    "vatAmount": 7.50,
    "vatRate": 0.20,
    "priceWithVAT": 45.00,
    "currency": "GBP"
  },
  "commissions": {
    "platformFee": 3.75,
    "platformCommissionPct": 0.10,
    "operatorNet": 33.75,
    "operatorCommission": 3.38,
    "operatorCommissionPct": 0.10,
    "driverPayout": 30.38
  },
  "breakdown": { ... }
}
```

### Test Booking Confirmation

```bash
curl -X POST http://localhost:3000/api/booking/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": "uuid-from-pricing-response",
    "bookingId": "test-booking-123",
    "organizationId": "9a5caade-4791-4860-93b5-c704eb580223"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Booking confirmed and financial snapshot created",
  "data": {
    "booking_id": "test-booking-123",
    "quote_id": "uuid-here",
    "booking_financial_id": "uuid-here",
    "leg_financial_ids": [],
    "line_item_ids": ["uuid1", "uuid2", "uuid3", ...]
  }
}
```

---

## Database Verification

After running tests, verify database writes:

### Check Quote Tables
```sql
-- Check booking quotes
SELECT 
  id,
  booking_type,
  vehicle_type,
  final_price_pence / 100.0 as final_price_gbp,
  quote_status,
  created_at
FROM client_booking_quotes
ORDER BY created_at DESC
LIMIT 10;

-- Check leg quotes
SELECT 
  id,
  leg_number,
  leg_type,
  leg_price_pence / 100.0 as leg_price_gbp,
  created_at
FROM client_leg_quotes
ORDER BY created_at DESC
LIMIT 10;
```

### Check Financial Snapshots
```sql
-- Check booking financials
SELECT 
  id,
  booking_id,
  booking_quote_id,
  customer_price_pence / 100.0 as customer_price_gbp,
  vat_amount_pence / 100.0 as vat_amount_gbp,
  platform_fee_pence / 100.0 as platform_fee_gbp,
  driver_payout_pence / 100.0 as driver_payout_gbp,
  snapshot_created_at
FROM internal_booking_financials
ORDER BY snapshot_created_at DESC
LIMIT 10;

-- Check line items
SELECT 
  id,
  booking_id,
  item_type,
  description,
  amount_pence / 100.0 as amount_gbp,
  is_taxable
FROM booking_line_items
ORDER BY created_at DESC
LIMIT 20;
```

### Verify Quote ID Propagation
```sql
-- Verify quote_id is NOT NULL in financial snapshots
SELECT 
  COUNT(*) as total_snapshots,
  COUNT(booking_quote_id) as snapshots_with_quote_id,
  COUNT(*) - COUNT(booking_quote_id) as snapshots_missing_quote_id
FROM internal_booking_financials;

-- Should show: snapshots_missing_quote_id = 0
```

---

## Troubleshooting

### Test Fails: "Backend server is not running"
**Solution:**
```bash
npm run dev
```

### Test Fails: "Quote ID not returned"
**Possible causes:**
1. QuoteService not connected in PricingController
2. Database permission error (RLS policy)
3. Supabase connection issue

**Debug:**
- Check backend logs for errors
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`
- Check Supabase RLS policies allow INSERT

### Test Fails: "Booking confirmation failed"
**Possible causes:**
1. Quote not found in database
2. Organization ID doesn't exist
3. Database permission error

**Debug:**
```sql
-- Check if quote exists
SELECT * FROM client_booking_quotes WHERE id = 'quote-id-here';

-- Check organization exists
SELECT * FROM organizations WHERE id = '9a5caade-4791-4860-93b5-c704eb580223';
```

### Test Fails: "VAT calculation inconsistency"
**Possible causes:**
1. Rounding error in calculation
2. VAT rate not fetched from database

**Debug:**
- Check `organization_settings.vat_rate`
- Verify rounding is done correctly (Math.round)

---

## Production Readiness Checklist

Before deploying to production, ensure:

- [ ] All 8 main tests pass
- [ ] All 3 critical tests pass
- [ ] Quote persistence working (tables not empty)
- [ ] Financial snapshots created (booking_quote_id NOT NULL)
- [ ] VAT calculation precise (no rounding errors)
- [ ] Commission calculation precise
- [ ] Driver payout always positive
- [ ] All database views accessible
- [ ] Organization settings configured
- [ ] RLS policies allow backend access
- [ ] Error handling works (test with invalid data)

---

## Performance Testing

For production load testing, use:

```bash
# Install Apache Bench
brew install ab  # macOS
apt-get install apache2-utils  # Linux

# Test pricing endpoint (100 requests, 10 concurrent)
ab -n 100 -c 10 -p test-payload.json -T application/json \
  http://localhost:3000/api/pricing/calculate-with-commissions
```

**Expected performance:**
- Response time: < 500ms (p95)
- Throughput: > 20 req/sec
- Error rate: 0%

---

## Continuous Integration

Add to CI/CD pipeline:

```yaml
# .github/workflows/test.yml
name: Pricing System Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Start backend
        run: npm run dev &
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
      
      - name: Wait for backend
        run: sleep 5
      
      - name: Run main tests
        run: node pricing-test-runner.js
      
      - name: Run critical tests
        run: node pricing-critical-tests.js
```

---

## Support

For issues or questions:
- Check backend logs: `npm run dev`
- Check Supabase logs: Supabase Dashboard → Logs
- Verify database schema: `ARCHITECTURE.md`
- Review test output for specific errors

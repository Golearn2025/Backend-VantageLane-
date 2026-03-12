# Quick Start - Pricing System Testing

## 🚀 Run Tests in 3 Steps

### Step 1: Start Backend
```bash
npm run dev
```

Wait for:
```
✅ Vantage Lane Pricing Backend running on port 3000
```

### Step 2: Run Main Tests
```bash
node pricing-test-runner.js
```

**Tests 8 scenarios:**
- Short trip, medium trip, long trip
- Hourly booking, daily booking
- Airport transfer, return trip, fleet booking

**Expected output:**
```
✅ TEST 1 PASSED
✅ TEST 2 PASSED
...
✅ ALL TESTS PASSED - SYSTEM READY FOR PRODUCTION
```

### Step 3: Run Critical Tests
```bash
node pricing-critical-tests.js
```

**Tests 3 edge cases:**
- Rounding precision
- Minimum fare edge case
- Pence precision

**Expected output:**
```
✅ ALL CRITICAL TESTS PASSED - NO PRODUCTION BUGS DETECTED
```

---

## ✅ What Gets Tested

### Pricing Calculation
- ✅ Base fare
- ✅ Distance pricing (tiered)
- ✅ Time pricing
- ✅ Airport fees
- ✅ Zone fees
- ✅ Minimum fare
- ✅ Rounding rules

### Financial Calculations
- ✅ VAT (20% UK VAT from organization_settings)
- ✅ Platform commission (10% from organization_settings)
- ✅ Operator commission (10% from organization_settings)
- ✅ Driver payout calculation

### Database Pipeline
- ✅ Quote creation (client_leg_quotes, client_booking_quotes)
- ✅ Quote ID returned in API response
- ✅ Booking confirmation
- ✅ Financial snapshot creation (booking_line_items, internal_leg_financials, internal_booking_financials)
- ✅ Quote ID propagation (booking_quote_id NOT NULL)

### Edge Cases
- ✅ No rounding errors in VAT/commissions
- ✅ No negative driver payouts
- ✅ No precision loss in pence conversion

---

## 📊 Test Results

### Success Output
```
┌────┬─────────────────────────────────────┬────────┬──────────┬──────────┬──────────┬──────────┐
│ #  │ Scenario                            │ Status │ Price    │ VAT      │ Platform │ Driver   │
├────┼─────────────────────────────────────┼────────┼──────────┼──────────┼──────────┼──────────┤
│ 1  │ Short City Trip (5km, 15min)        │ ✅ PASS│ £25.50   │ £4.25    │ £2.13    │ £19.13   │
│ 2  │ Medium City Trip (20km, 35min)      │ ✅ PASS│ £45.00   │ £7.50    │ £3.75    │ £33.75   │
│ 3  │ Long Distance Trip (120km, 120min)  │ ✅ PASS│ £180.00  │ £30.00   │ £15.00   │ £135.00  │
│ 4  │ Hourly Booking (4 hours)            │ ✅ PASS│ £384.00  │ £64.00   │ £32.00   │ £288.00  │
│ 5  │ Daily Booking (2 days)              │ ✅ PASS│ £1536.00 │ £256.00  │ £128.00  │ £1152.00 │
│ 6  │ Airport Transfer (LHR)              │ ✅ PASS│ £55.00   │ £9.17    │ £4.58    │ £41.25   │
│ 7  │ Return Trip (25km each way)         │ ✅ PASS│ £81.00   │ £13.50   │ £6.75    │ £60.75   │
│ 8  │ Fleet Booking (3 vehicles)          │ ✅ PASS│ £135.00  │ £22.50   │ £11.25   │ £101.25  │
└────┴─────────────────────────────────────┴────────┴──────────┴──────────┴──────────┴──────────┘

✅ ALL TESTS PASSED - SYSTEM READY FOR PRODUCTION
```

---

## ❌ Troubleshooting

### "Backend server is not running"
```bash
# Start backend
npm run dev
```

### "Quote ID not returned"
**Check:**
1. Backend logs for errors
2. Supabase connection (SUPABASE_URL, SUPABASE_ANON_KEY in .env)
3. Database RLS policies allow INSERT

### "Booking confirmation failed"
**Check:**
1. Organization ID exists in database
2. Quote was created successfully
3. Database permissions

### Tests pass but tables are empty
**Check:**
1. Supabase RLS policies
2. Backend logs for database errors
3. Run query: `SELECT * FROM client_booking_quotes ORDER BY created_at DESC LIMIT 5;`

---

## 📝 Manual Test

```bash
# Test pricing
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

# Copy quote_id from response, then:

# Test booking confirmation
curl -X POST http://localhost:3000/api/booking/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": "paste-quote-id-here",
    "bookingId": "test-123",
    "organizationId": "9a5caade-4791-4860-93b5-c704eb580223"
  }'
```

---

## 📚 Full Documentation

See `TESTING.md` for:
- Detailed test explanations
- Database verification queries
- Performance testing
- CI/CD integration
- Production readiness checklist

---

## ✨ Production Ready Criteria

System is production-ready when:
- ✅ All 8 main tests pass
- ✅ All 3 critical tests pass
- ✅ No rounding errors
- ✅ No negative payouts
- ✅ Quote tables populated
- ✅ Financial snapshots created
- ✅ booking_quote_id NOT NULL

**If all tests pass → Deploy to production! 🚀**

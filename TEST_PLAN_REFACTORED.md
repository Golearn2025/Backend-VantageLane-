# TEST PLAN - Flow Refactorizat Quote → Financial Snapshot

## 📋 Scop

Verificarea că modificările din `QuoteService.ts` și `FinancialSnapshotService.ts` funcționează corect end-to-end:

1. ✅ Quote-urile folosesc noul format `line_items` standardizat (components[], discounts[], multipliers[])
2. ✅ Financial snapshots se creează cu schema DB reală (toate coloanele corecte)
3. ✅ `booking_line_items` NU mai primește pricing breakdown
4. ✅ Toate valorile sunt în PENCE și consistente

---

## 🚀 Cum Rulezi Testul

### 1. Asigură-te că ai .env configurat

```bash
# Verifică că ai SUPABASE_URL și SUPABASE_ANON_KEY în .env
cat .env | grep SUPABASE
```

### 2. Rulează scriptul de test

```bash
# Compile și rulează
npx ts-node test-refactored-flow.ts
```

### 3. Citește output-ul

Scriptul va afișa:
- ✅ Pași executați cu succes
- ⚠️ Warning-uri (dacă există)
- ❌ Erori (dacă există)
- 📋 Query-uri SQL pentru verificare finală

---

## 📊 Ce Face Testul (6 Pași)

### STEP 1: Create booking and leg
- Creează un booking de test în status `NEW`
- Creează un booking_leg cu distance/duration

### STEP 2: Calculate pricing
- Apelează `PricingEngine.calculate()` cu:
  - Pickup: London Heathrow Airport
  - Dropoff: Central London
  - Vehicle: Luxury
  - Booking Type: One-way
  - Distance: 45.06 km (28 miles)
  - Duration: 45 minutes

### STEP 3: Create quote (REFACTORED)
- Apelează `QuoteService.createQuote()`
- Verifică că se creează:
  - `client_booking_quotes` cu `line_items` NOU format
  - `client_leg_quotes` cu `line_items` NOU format

### STEP 4: Confirm booking
- Update booking status → `CONFIRMED`

### STEP 5: Create financial snapshot (REFACTORED)
- Apelează `FinancialSnapshotService.createFinancialSnapshot()`
- Verifică că se creează:
  - `internal_booking_financials` cu TOATE coloanele din schema reală
  - `internal_leg_financials` cu TOATE coloanele din schema reală
  - `booking_line_items` rămâne GOALĂ (count = 0)

### STEP 6: Fetch and verify
- Citește datele create
- Verifică format-ul `line_items`
- Verifică că `booking_line_items` e goală

---

## ✅ Rezultat CORECT Așteptat

### 1. Console Output

```
🚀 TESTING REFACTORED FLOW

═══════════════════════════════════════════════════════════

📝 STEP 1: Creating test booking and leg...

✅ Booking created: [UUID]
✅ Booking leg created: [UUID]

💰 STEP 2: Calculating pricing...

✅ Pricing calculated
   Final Price: £XX.XX
   Breakdown: base=X, distance=X, time=X

💾 STEP 3: Creating quote with QuoteService.createQuote()...

✅ Quote created
   Booking Quote ID: [UUID]
   Leg Quote IDs: [UUID]

✅ STEP 4: Confirming booking...

✅ Booking confirmed

📊 STEP 5: Creating financial snapshot...

✅ Financial snapshot created
   Booking Financial ID: [UUID]
   Leg Financial IDs: [UUID]
   Line Item IDs: 0 (should be 0)

🔍 STEP 6: Fetching created data for verification...

📋 QUOTE DATA:
   Subtotal: XXXX pence
   Discount: 0 pence
   VAT: XXXX pence
   Total: XXXX pence
   Line Items Format: NEW (components[])
   Components count: 5
   Calc source: pricing_engine_v2
   Calc version: 2.0.0

💰 BOOKING FINANCIAL DATA:
   Gross amount: XXXX pence
   VAT: XXXX pence
   Subtotal ex VAT: XXXX pence
   Platform fee: XXX pence (1000 bp)
   Operator fee: XXX pence (1000 bp)
   Driver payout: XXXX pence
   Processor fee: 0 pence
   Line items source: quote_snapshot

📦 BOOKING LINE ITEMS:
   Count: 0
   ✅ CORRECT: No pricing breakdown in booking_line_items

═══════════════════════════════════════════════════════════
✅ TEST PASSED
═══════════════════════════════════════════════════════════
```

### 2. SQL Queries Output

Scriptul va genera 4 query-uri SQL pentru verificare manuală în Supabase:

**Query 1 - Verify booking quote line_items:**
```sql
SELECT 
  id,
  subtotal_pence,
  discount_pence,
  vat_pence,
  total_pence,
  line_items->'components' as components,
  line_items->'discounts' as discounts,
  line_items->'multipliers' as multipliers,
  line_items->'summary' as summary,
  line_items->'meta' as meta
FROM client_booking_quotes 
WHERE id = '[UUID]';
```

**Rezultat așteptat:**
- `components`: Array cu 4-7 obiecte `{ code, label, amount_pence }`
- `discounts`: Array (poate fi gol sau cu discounts)
- `multipliers`: Array (poate fi gol sau cu multipliers)
- `summary`: Object cu `{ subtotal_pence, discount_pence, vat_pence, total_pence }`
- `meta`: Object cu `{ calc_source: "pricing_engine_v2", calc_version: "2.0.0" }`

**Query 2 - Verify leg quote line_items:**
```sql
SELECT 
  id,
  booking_leg_id,
  subtotal_pence,
  vat_pence,
  total_pence,
  line_items->'components' as components,
  line_items->'summary' as summary
FROM client_leg_quotes 
WHERE booking_quote_id = '[UUID]';
```

**Rezultat așteptat:**
- `booking_leg_id`: NOT NULL (UUID valid)
- `components`: Array cu componente (base_fare, distance_fee, etc.)
- `summary`: Object cu pricing summary

**Query 3 - Verify booking financial:**
```sql
SELECT 
  id,
  quote_id,
  pricing_version_id,
  gross_amount_pence,
  vat_amount_pence,
  subtotal_ex_vat_pence,
  platform_fee_pence,
  platform_fee_rate_bp,
  operator_fee_pence,
  operator_fee_rate_bp,
  driver_payout_pence,
  vendor_cost_pence,
  platform_profit_pence,
  processor_fee_pence,
  net_collected_pence,
  net_to_platform_pence,
  net_to_operator_pence,
  net_to_driver_pence,
  booking_payment_id,
  pricing_source,
  line_items->'source' as line_items_source,
  line_items->'summary' as line_items_summary,
  line_items->'commissions' as line_items_commissions
FROM internal_booking_financials 
WHERE id = '[UUID]';
```

**Rezultat așteptat:**
- Toate coloanele NON-NULL (except `booking_payment_id` și `pricing_version_id`)
- `platform_fee_rate_bp`: ~1000 (10%)
- `operator_fee_rate_bp`: ~1000 (10%)
- `processor_fee_pence`: 0 (temporar)
- `booking_payment_id`: NULL (temporar)
- `pricing_source`: "quote_snapshot"
- `line_items.source`: "quote_snapshot"
- `line_items.commissions`: Object cu toate fee-urile

**Query 4 - Verify leg financial:**
```sql
SELECT 
  id,
  booking_leg_id,
  booking_id,
  version,
  driver_payout_pence,
  platform_fee_pence,
  vendor_cost_pence,
  line_items->'source' as line_items_source,
  line_items->'pricing' as line_items_pricing,
  line_items->'components' as line_items_components,
  line_items->'commissions' as line_items_commissions
FROM internal_leg_financials 
WHERE booking_id = '[UUID]';
```

**Rezultat așteptat:**
- `booking_leg_id`: NOT NULL
- `version`: 1
- `line_items.source`: "quote_snapshot"
- `line_items.pricing`: Object cu subtotal/vat/total
- `line_items.components`: Array din quote
- `line_items.commissions`: Object cu fee breakdown

**Query 5 - Verify booking_line_items EMPTY:**
```sql
SELECT COUNT(*) as count, 
       array_agg(item_type) as item_types
FROM booking_line_items 
WHERE booking_id = '[UUID]';
```

**Rezultat așteptat:**
- `count`: 0
- `item_types`: NULL

---

## ❌ Rezultat INCORECT (Ce Trebuie Fix-uit)

### Dacă vezi:

1. **ERROR: column "quote_status" does not exist**
   - ✅ REZOLVAT: `updateQuoteStatus()` e acum NO-OP

2. **ERROR: column "leg_quote_id" does not exist**
   - ❌ PROBLEMA: `internal_leg_financials` nu are această coloană
   - ✅ REZOLVAT: Schema folosește `booking_leg_id`

3. **ERROR: column "customer_price_pence" does not exist**
   - ❌ PROBLEMA: `internal_booking_financials` nu are aceste coloane vechi
   - ✅ REZOLVAT: Folosim `gross_amount_pence`, `vat_amount_pence`, etc.

4. **booking_line_items count > 0**
   - ❌ PROBLEMA: `createLineItems()` încă se apelează
   - ✅ REZOLVAT: Apelul a fost eliminat

5. **line_items format greșit (nu are components[])**
   - ❌ PROBLEMA: QuoteService nu a fost refactorizat corect
   - Verifică că folosești versiunea NOUĂ

---

## 🔧 Debugging

### Dacă testul eșuează:

1. **Verifică conexiunea DB:**
```bash
# Test Supabase connection
curl -H "apikey: YOUR_ANON_KEY" https://YOUR_PROJECT.supabase.co/rest/v1/
```

2. **Verifică schema DB:**
```sql
-- Verifică coloane client_booking_quotes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'client_booking_quotes';

-- Verifică coloane internal_booking_financials
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'internal_booking_financials';
```

3. **Verifică RLS policies:**
```sql
-- Verifică dacă RLS blochează insert-urile
SELECT * FROM pg_policies 
WHERE tablename IN ('bookings', 'booking_legs', 'client_booking_quotes');
```

4. **Rulează manual pași:**
```typescript
// Test doar pricing
const result = await PricingEngine.calculate({...});
console.log(result);

// Test doar quote
const quote = await QuoteService.createQuote(result, request, orgId);
console.log(quote);
```

---

## ✅ Criteriu de Succes

Testul este **PASS** dacă:

1. ✅ Toate cele 6 pași se execută fără eroare
2. ✅ `client_booking_quotes.line_items` are structură `{ components[], discounts[], multipliers[], summary, meta }`
3. ✅ `client_leg_quotes.line_items` are structură similară
4. ✅ `internal_booking_financials` are TOATE cele 27 coloane populate
5. ✅ `internal_leg_financials` are coloanele corecte + `line_items` JSONB
6. ✅ `booking_line_items` are COUNT = 0 (nu pricing breakdown)
7. ✅ Valorile financiare bat: `quote.total_pence` = `financial.gross_amount_pence`

---

## 📞 Next Steps După Test

### Dacă TEST PASSED ✅

1. Run query-urile SQL generate pentru verificare vizuală
2. Confirmă că toate datele arată corect în Supabase dashboard
3. Marchează task-ul ca DONE
4. Opțional: șterge `createLineItems()` deprecated function

### Dacă TEST FAILED ❌

1. Citește error message exact
2. Verifică ce pas a eșuat
3. Rulează query-uri SQL pentru a vedea ce s-a scris în DB
4. Raportează eroarea cu detalii complete
5. Fix-uiește problema identificată și re-run test

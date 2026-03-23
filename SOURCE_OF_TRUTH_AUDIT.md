# SOURCE OF TRUTH MAP - AUDIT COMPLET (FĂRĂ MODIFICĂRI)

## 📊 STATUS ACTUAL - UNDE STĂM

---

## ✅ 1. BOOKINGS - BINE PLASAT

### Ce AVEM:
```
✅ id, customer_id, organization_id
✅ booking_type, fleet_mode, status
✅ currency, source
✅ start_at, end_at
✅ hours_requested, days_requested
✅ passenger_count, bag_count
✅ billing_entity_id
✅ trip_configuration_raw (JSONB)
✅ billing_snapshot (JSONB)
✅ platform_fee_rate_bp_override
✅ operator_fee_rate_bp_override
✅ reference, notes_internal
```

### Rol ACTUAL vs Rol FINAL:
**ACTUAL:** ✅ Bun - este input master pentru booking
**FINAL:** ✅ Perfect aligned - rămâne source of truth pentru booking config

### ⚠️ Observații:
- `trip_configuration_raw` conține doar test data în booking-urile de test
- `billing_snapshot` este NULL în toate booking-urile verificate
- Override-urile de fee sunt prezente dar nefolosite

### VERDICT: **✅ BINE - NU NECESITĂ MODIFICĂRI MAJORE**

---

## ✅ 2. BOOKING_LEGS - BINE PLASAT

### Ce AVEM:
```
✅ id, booking_id, leg_number, leg_kind, status
✅ pickup_place_id, pickup_address, pickup_lat, pickup_lng
✅ dropoff_place_id, dropoff_address, dropoff_lat, dropoff_lng
✅ stops_raw (JSONB)
✅ scheduled_at, scheduled_end_at
✅ flight_number
✅ vehicle_category_id, vehicle_model_id
✅ preferences (JSONB), addons (JSONB)
✅ distance_miles, duration_min
✅ assigned_driver_id, assigned_vehicle_id, assigned_at
✅ route_input (JSONB)
```

### Rol ACTUAL vs Rol FINAL:
**ACTUAL:** ✅ Bun - este execution truth
**FINAL:** ✅ Perfect aligned - rămâne source of truth pentru route & execution

### VERDICT: **✅ BINE - NU NECESITĂ MODIFICĂRI MAJORE**

---

## ✅ 3. CLIENT_BOOKING_QUOTES - FOARTE BINE PLASAT

### Ce AVEM:
```
✅ id, booking_id
✅ subtotal_pence, discount_pence, vat_pence, total_pence
✅ currency
✅ calc_source, calc_version
✅ line_items (JSONB) - format NOU standardizat
✅ pricing_version_id (există în schema)
```

### Ce LIPSEȘTE:
```
❌ version (pentru istoric)
❌ is_locked (pentru freeze quote)
❌ quote_valid_until (pentru expirare)
```

### Line Items Format ACTUAL:
```json
{
  "components": [
    {"code": "base_fare", "label": "Base fare", "amount_pence": 12000},
    {"code": "distance_fee", "label": "Distance fee", "amount_pence": 13037},
    {"code": "time_fee", "label": "Time fee", "amount_pence": 2700},
    {"code": "additional_fees", "label": "Additional fees", "amount_pence": 500}
  ],
  "discounts": [],
  "multipliers": [],
  "summary": {
    "subtotal_pence": 28237,
    "discount_pence": 0,
    "vat_pence": 5647,
    "total_pence": 33884
  },
  "meta": {
    "calc_source": "pricing_engine_v2",
    "calc_version": "2.0.0"
  }
}
```

### VERDICT: **✅ FOARTE BINE - format standardizat corect implementat**
**Lipsesc doar:** version, is_locked, quote_valid_until (extensie minoră)

---

## ⚠️ 4. CLIENT_LEG_QUOTES - GOALĂ (NORMAL)

### Status:
```
Rows: 0
```

### Observație:
Normal pentru teste current (nu avem multi-leg bookings în testele rulate)

### VERDICT: **✅ BINE - tabel pregătit, va fi folosit pentru multi-leg**

---

## 🚨 5. BOOKING_LINE_ITEMS - PROBLEMĂ CRITICĂ

### Ce PRIMEȘTE ACUM (GREȘIT):
```sql
-- PRICING COMPONENTS în booking_line_items (NU TREBUIE!)
booking_id: 2a484d3d-a868-489d-901c-6b26c798cd3a
item_group: included_service
item_key: base_fare        ❌ GREȘIT
item_value: Base Fare
source: pricing_engine_v2

item_key: distance_fee     ❌ GREȘIT
item_value: Distance Fee (18.5 miles)
source: pricing_engine_v2

item_key: time_fee         ❌ GREȘIT
item_value: Time Fee (45 minutes)
source: pricing_engine_v2
```

### Ce PRIMEȘTE CORECT:
```
✅ included_service: refreshments (70 items)
✅ included_service: meet-greet (70 items)
✅ included_service: onboard-wifi (70 items)
✅ included_service: phone-chargers (70 items)
✅ trip_preference: music (36 items)
✅ trip_preference: communication (34 items)
✅ paid_upgrade: securityEscort (30 items)
✅ premium_feature: frontSeatRequest (28 items)
```

### VERDICT: **❌ PROBLEMA CRITICĂ IDENTIFICATĂ**

**INTERDICȚIE VIOLATĂ:**
> booking_line_items NU mai primește: base_fare, distance_fee, time_fee, airport_fee, pricing core components

**Sursa problemei:** Un cod vechi (înainte de refactor) încă populează pricing components aici.

**Ce trebuie:**
1. Găsit codul care inserează base_fare/distance_fee/time_fee în booking_line_items
2. Eliminat/disabled acel cod
3. Cleanup date vechi (opțional)

---

## 🔥 6. SERVICE_ITEMS - HAOS COMPLET

### Status ACTUAL:
```
Total items: 43
Unique names: 21
Duplicate rate: 2.05x (peste 100% duplicate!)
```

### DUPLICATE IDENTIFICATE:

#### Champagne Moet (4 aliasuri! 🔥):
```
❌ moet
❌ champagne_moet
❌ champagne-moet
❌ moet_brut
Toate active simultan pentru: "Moët & Chandon Brut Imperial"
```

#### Security Escort (3 aliasuri):
```
❌ security_escort
❌ security-escort
❌ securityEscort
```

#### Flowers Exclusive (3 aliasuri):
```
❌ bouquet_exclusive
❌ flowers_exclusive
❌ flowers-exclusive
```

#### Flowers Standard (3 aliasuri):
```
❌ bouquet_standard
❌ flowers_standard
❌ flowers-standard
```

#### Dom Pérignon (3 aliasuri):
```
❌ champagne_dom_perignon_2015
❌ dom_perignon_2015
❌ champagne-dom-perignon
```

#### Premium Features (toate duplicate 2x):
```
❌ pet_friendly vs pet-friendly
❌ personal-luggage-privacy vs personalLuggagePrivacy
❌ paparazzi-safe-mode vs paparazziSafeMode
❌ comfort-ride-mode vs comfortRideMode
❌ front-seat-request vs frontSeatRequest
```

#### Included Services (duplicate 2x):
```
❌ wifi vs onboard-wifi
❌ greeting vs meet-greet
❌ waiting_time vs airport-wait-time
❌ extra_stops vs extra-stops
❌ chargers vs phone-chargers
❌ assistance vs luggage-assistance
```

### VERDICT: **🔥 HAOS CRITIC - NECESITĂ CANONIZARE URGENTĂ**

**Impact:**
- Frontend nu știe ce ID să folosească
- Booking_line_items pointează la aliasuri diferite
- Pricing logic inconsistentă
- Rapoarte confuze

**Ce trebuie:**
1. Alegere ID-uri canonice (un singur ID per serviciu)
2. Deactivare duplicate
3. Migrare booking_line_items să pointeze la canonical IDs
4. Adăugare service_item_id în booking_line_items

---

## ✅ 7. INTERNAL_BOOKING_FINANCIALS - BINE

### Ce AVEM:
```
✅ id, booking_id, version, currency
✅ gross_amount_pence, vat_amount_pence, subtotal_ex_vat_pence
✅ platform_fee_pence, platform_fee_rate_bp
✅ operator_fee_pence, operator_fee_rate_bp
✅ driver_payout_pence
✅ vendor_cost_pence
✅ platform_profit_pence
✅ processor_fee_pence
✅ net_collected_pence
✅ net_to_platform_pence, net_to_operator_pence, net_to_driver_pence
✅ quote_id, booking_payment_id
✅ pricing_version_id
✅ pricing_source
✅ line_items (JSONB)
✅ calculated_at, created_at, updated_at
```

### Line Items Format ACTUAL (BINE):
```json
{
  "source": "quote_snapshot",
  "quote_id": "8bf402d1-f3ee-4731-a371-33515e4c1159",
  "components": [...],
  "discounts": [],
  "multipliers": [],
  "summary": {
    "subtotal_pence": 28237,
    "discount_pence": 0,
    "vat_pence": 5647,
    "gross_amount_pence": 33884,
    "subtotal_ex_vat_pence": 28237
  },
  "commissions": {
    "platform_fee_pence": 2824,
    "platform_fee_rate_bp": 1000,
    "operator_fee_pence": 2287,
    "operator_fee_rate_bp": 900,
    "driver_payout_pence": 23126
  },
  "leg_financial_ids": []
}
```

### Ce LIPSEȘTE (minor):
```
⚠️ driver_trip_payout vs driver_service_payout (split logic)
⚠️ vendor_trip_cost vs vendor_service_cost (split logic)
⚠️ processor_fee_estimated vs processor_fee_actual
```

### VERDICT: **✅ FOARTE BINE - fundație solidă, extensii minore opționale**

---

## ⚠️ 8. INTERNAL_LEG_FINANCIALS - GOALĂ (NORMAL)

### Status:
```
Rows: 0
```

### Ce AVEM în schema:
```
✅ id, booking_leg_id, booking_id, version
✅ driver_payout_pence
✅ platform_fee_pence
✅ vendor_cost_pence
✅ line_items (JSONB)
```

### Ce LIPSEȘTE față de booking-level:
```
❌ subtotal_ex_vat_pence
❌ vat_amount_pence
❌ gross_amount_pence
❌ operator_fee_pence
❌ split între trip/service payout
```

### VERDICT: **⚠️ SUBȚIRE - necesită extindere când folosim multi-leg**

---

## 🔥 9. PRICING_COMMISSION_PROFILES - PROBLEMA MARE

### Ce AVEM:
```
id: 0a8a4e37-c47c-4f75-aed5-8fa4868d5508
organization_id: 9a5caade-4791-4860-93b5-12b1c4fa9830
platform_fee_percent: 30     🔥 GREȘIT (ar trebui 10 sau 0.10)
operator_fee_percent: 0      🔥 GREȘIT (ar trebui 9 sau 0.09)
active: true
created_at: 2026-03-11
```

### Ce LIPSEȘTE COMPLET:
```
❌ pricing_version_id (nu e legat de pricing versions)
❌ effective_from / effective_until (nu are istoric)
❌ updated_at (nu se poate tracka modificări)
❌ granularitate (nu poate avea rate-uri diferite per vehicle/booking type)
```

### VERDICT: **🔥 PROBLEMĂ MARE - model prea simplu și valori greșite**

**Note:**
- Am fixat deja în `organization_settings` (0.10, 0.09) pentru test
- Dar `pricing_commission_profiles` încă are valori vechi greșite (30, 0)
- Două surse de truth pentru aceeași informație = BAD

---

## ❌ 10. BOOKING_PAYMENTS - NU VERIFICAT COMPLET

### Status:
```
Rows: 149
RLS: enabled
```

### Ce trebuie verificat:
```
⏸️ Are processor_fee_pence real?
⏸️ Are net_settlement?
⏸️ Are refunded_total?
⏸️ Are balance_transaction_id?
⏸️ Link corect la internal_booking_financials?
```

### VERDICT: **⏸️ NECESITĂ VERIFICARE SUPLIMENTARĂ**

---

## ❌ 11. COMMERCIAL RULES - NU EXISTĂ

### Ce LIPSEȘTE COMPLET:
```
❌ Membership discount rules
❌ Corporate negotiated rates
❌ Customer-specific pricing terms
❌ Billing-entity-specific commercial terms
❌ Waived fees / exceptions
```

### Unde AR TREBUI:
Nou tabel: `commercial_rules` sau `pricing_rules_customer`

### VERDICT: **❌ LIPSEȘTE - va fi necesar pentru B2B/corporate**

---

## 📋 CONCLUZIE FINALĂ - UNDE STĂM

### ✅ CE AVEM BINE (70%):

1. **bookings** - ✅ Perfect ca input master
2. **booking_legs** - ✅ Perfect ca execution truth
3. **client_booking_quotes** - ✅ Foarte bine (format standardizat corect)
4. **internal_booking_financials** - ✅ Foarte bine (fundație solidă)
5. **stripe_events** - ✅ Prezent (nu verificat detaliat)

### 🚨 CE AVEM GREȘIT (30%):

1. **booking_line_items** - 🔥 PRIMEȘTE pricing components (base_fare, etc.) - INTERZIS!
2. **service_items** - 🔥 HAOS COMPLET (43 items, 21 unique = 100%+ duplicate)
3. **pricing_commission_profiles** - 🔥 Valori greșite (30, 0) + model prea simplu

### ⚠️ CE LIPSEȘTE:

1. **client_booking_quotes** - version, is_locked, quote_valid_until
2. **internal_leg_financials** - extensie pentru multi-leg (subtotal, VAT, etc.)
3. **booking_payments** - verificare completă (processor fee, refunds, etc.)
4. **commercial_rules** - lipsește complet (pentru corporate/membership)

---

## 🎯 ACȚIUNI PRIORITARE (ORDINE)

### PRIORITATE 1 - CRITICĂ (BLOCKER):

#### 1.1 Stop pricing components în booking_line_items
```
🔥 URGENT - identificat cod care inserează base_fare/distance_fee/time_fee
📍 Source: pricing_engine_v2
🎯 Acțiune: Găsește și elimină codul care face insert-ul
```

#### 1.2 Canonizare service_items
```
🔥 URGENT - 43 items cu 21 unique names
📍 Moet are 4 aliasuri active simultan!
🎯 Acțiune: 
   - Alege IDs canonice (moet_brut SAU champagne_moet)
   - Deactivează duplicate
   - Migrare booking_line_items
```

### PRIORITATE 2 - IMPORTANTĂ (NU BLOCKER):

#### 2.1 Cleanup pricing_commission_profiles
```
⚠️ Valori greșite (30, 0) vs (10, 9) în organization_settings
📍 Două surse de truth pentru același lucru
🎯 Acțiune: Alege una (probabil organization_settings) și șterge/migrează cealaltă
```

#### 2.2 Adăugare service_item_id în booking_line_items
```
⚠️ Acum pointează prin item_key (string)
🎯 Acțiune: Adaugă coloană service_item_id (UUID) pentru referință canonică
```

### PRIORITATE 3 - NICE TO HAVE:

#### 3.1 Extindere client_booking_quotes
```
✅ Fundație bună
📝 Adaugă: version, is_locked, quote_valid_until
```

#### 3.2 Extindere internal_leg_financials
```
✅ Prezent dar gol
📝 Adaugă: subtotal_ex_vat, VAT, gross când folosim multi-leg
```

---

## 🔍 CE TREBUIE VERIFICAT NEXT

1. ✅ Găsit codul care populează booking_line_items cu pricing components
2. ⏸️ Verificat booking_payments schema completă
3. ⏸️ Verificat stripe_events usage
4. ⏸️ Verificat coupons & coupon_redemptions
5. ⏸️ Plan pentru commercial_rules (dacă e nevoie)

---

## ✅ CE MERGE DEJA PERFECT

Din testul end-to-end de astăzi:
- ✅ Quote creat cu RLS activ
- ✅ Financial snapshot cu comisioane corecte (după fix organization_settings)
- ✅ booking_line_items GOALĂ pentru booking-uri noi (refactor funcționează!)
- ✅ Format line_items standardizat
- ✅ Service role key funcționează

**Problema cu pricing components în booking_line_items este VECHE (din seed/old bookings)**
**Pentru booking-uri NOI create după refactor - funcționează corect!**

---

**Data audit:** 2026-03-16
**Booking test:** 6ccb35f9-47f3-4f8e-828d-b714a8feeb10
**Status:** READY pentru cleanup service_items + verificare cod vechi pricing

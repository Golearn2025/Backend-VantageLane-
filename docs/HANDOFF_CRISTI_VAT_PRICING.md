# Handoff Cristi — TVA din DB + aliniere website

**De la:** Tomita  
**Data:** 20 mai 2026  
**Plan:** merge / deploy **backend pe `main` dimineața** (Render: `vantage-lane-pricing-backend`).  
**Website:** `vantage-lane-2.0` — **nu am făcut deploy / PR**; modificarea e de făcut de Cristi.

---

## 1. Ce am făcut în backend (deja pe `main` local / de pus live)

### TVA din `organization_settings` (nu mai e 0% hardcodat)

- **`POST /api/pricing/calculate-and-quote`** (Phase 2A) citește `organization_settings.vat_rate` (ex. `0.20`).
- Răspunsul include acum:
  - `pricing.finalPrice` = **total client de plată (cu TVA)**
  - `pricing.priceBeforeVAT` = net
  - `pricing.vatAmount`, `pricing.vatRate`
  - `pricing.breakdown` = breakdown-ul motorului (**net**, neschimbat semantic)
- **`POST /api/pricing/preview-all-categories`** — aceleași prețuri per categorie **cu TVA**, ca să fie aliniat cu landing / pasul 1.

### Alte fix-uri pricing (aceeași perioadă)

- Discount **return** citit din `pricing_return_rules` (nu 10% hardcodat).
- **Legs total mismatch** la convert quote → booking când TVA > 0 (`quoteLineItemsBuilder` — validare pe net, TVA alocat per leg).
- Tarifele din admin (`pricing_vehicle_rates` etc.) rămân **NET (ex VAT)**; TVA doar din `vat_rate`.

### Commit-uri relevante pe `main` (backend)

```
c787439 fix(pricing): allow VAT on booking total while legs stay net in validation
3bb6492 fix(pricing): apply organization vat_rate to Phase 2A quotes and previews
b2409c3 fix(pricing): read return discount from pricing_return_rules
```

### DB (Supabase)

- `organization_settings.vat_rate` = **0.20** (exemplu actual).
- Schimbarea ratei / minimum fare în admin → după deploy, invalidează cache pricing (`POST /api/cache/invalidate` sau TTL ~30s).

---

## 2. Ce NU am făcut (website)

- **Nu** am făcut PR / deploy pe **`vantage-lane-2.0`**.
- Problema vizibilă: la **pasul 1–2** utilizatorul vede prețul **cu TVA** (ex. £180); la **Payment & pricing (pas 3)** codul vechi lua **`breakdown.finalPrice` (net, ex. £150)** în loc de **`pricing.finalPrice`**.

---

## 3. Ce ai de făcut tu pe website (obligatoriu pentru UX corect)

**Repo:** `vantage-lane-2.0`  
**Fișier principal:** `src/features/booking/wizard/components/step3/paymentCardPricing.ts`

### Problema

În `computePaymentPricingBreakdown`, când există `quoteResponse`:

```ts
// GREȘIT (cod vechi):
const payableNow = roundMoney(breakdown.finalPrice ?? quoteResponse.pricing.finalPrice);
```

`breakdown.finalPrice` = **net** din motor.  
`pricing.finalPrice` = **total cu TVA** din backend.

### Fix minim (recomandat)

```ts
// CORECT:
const payableNow = roundMoney(quoteResponse.pricing.finalPrice);
const subtotalExVat = roundMoney(quoteResponse.pricing.priceBeforeVAT ?? /* fallback split */);
const vatAmount = roundMoney(quoteResponse.pricing.vatAmount ?? /* fallback */);
const totalInclVat = payableNow;
```

Opțional: extinde tipul `QuoteResponse` în `src/types/backend-integration.types.ts` cu `priceBeforeVAT`, `vatAmount`, `vatRate`.

### Verificare după fix

1. Cursă luxury cu minimum → pas 1: **£180**, pas 3 total: **£180** (nu £150).
2. Cu extras (flori/șampanie) → total pas 3 = quote backend (extras sunt în net + TVA pe total).
3. Fleet → total aliniat cu `calculate-and-quote` fleet.

### Notă separată (nu blochează TVA, dar de știut)

- Prețurile extras în **summary** folosesc `UPGRADE_PRICES` **hardcodat** în `upgrades.actions.ts`; backend folosește **`service_items`** din DB. Dacă prețurile din admin diferă de cod, summary poate arăta altfel decât quote-ul — de aliniat ulterior.

---

## 4. Risc dacă NU faci modificarea pe website

| Aspect | Situație |
|--------|----------|
| **Afișare pas 3** | Clientul vede **£150** când la pas 1 a văzut **£180** — confuzie. |
| **Plată Stripe** | Payment Intent din **booking în DB** (`bookingId`), nu neapărat din `payableNow` UI. După convert, totalul ar trebui **cu TVA** → risc financiar major **mic** dacă convert e corect. |
| **Formular Stripe** | `totalAmount={payableNow}` poate afișa suma greșită chiar dacă PI server e corect. |

**Dacă nu poți face modificarea:** sună Tomita — **revin la cum era înainte** pe backend (`vat_rate = 0` și/sau revert commit-uri TVA), ca totul să fie consistent cu site-ul vechi.

---

## 5. Deploy mâine dimineață

### Backend

1. Push `main` → Render `vantage-lane-pricing-backend`.
2. Confirmă `organization_settings.vat_rate` în Supabase.
3. Smoke: `calculate-and-quote` → `finalPrice` > `priceBeforeVAT` când `vat_rate = 0.20`.

### Website (Cristi)

1. Fix `paymentCardPricing.ts` (secțiunea 3).
2. Deploy `vantage-lane-2.0`.
3. Test E2E: pas 1 → 2 → 3, același total.

---

## 6. Revert rapid (dacă nu se face fix website)

1. Supabase: `organization_settings.vat_rate = 0`.
2. Sau revert backend commits `3bb6492` + `c787439` + redeploy.

---

## 7. Contact

Dacă nu e clar sau nu ajungi la fix înainte de deploy site: **sună Tomita**.

**Nu am făcut modificări pe website** — doar backend + acest document.

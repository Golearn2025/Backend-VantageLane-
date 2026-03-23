# Line Items JSON Standard Format

## Overview

Acest document definește formatul standard pentru câmpurile JSONB `line_items` în tabelele:
- `client_booking_quotes.line_items`
- `client_leg_quotes.line_items`
- `internal_booking_financials.line_items`
- `internal_leg_financials.line_items`

---

## 1. CLIENT_BOOKING_QUOTES.line_items

### Schema TypeScript
```typescript
interface BookingQuoteLineItems {
  // Array de componente pricing
  components: PricingComponent[];
  
  // Array de discount-uri aplicate
  discounts: Discount[];
  
  // Array de multiplicatori (surge, seasonal, etc.)
  multipliers: Multiplier[];
  
  // Sumar financiar
  summary: QuoteSummary;
  
  // Metadata despre calcul
  meta: QuoteMetadata;
}

interface PricingComponent {
  code: string;          // base_fare, distance_fee, time_fee, etc.
  label: string;         // "Base fare", "Distance fee", etc.
  amount_pence: number;  // Valoare în PENCE
}

interface Discount {
  code: string;          // promo_code, loyalty, etc.
  label: string;         // "Promo Code: SAVE20"
  amount_pence: number;  // Valoare negativă sau pozitivă în PENCE
  type: 'percentage' | 'fixed';
  value?: number;        // 20 pentru 20%, 1000 pentru £10
}

interface Multiplier {
  code: string;          // surge, peak_hours, seasonal
  label: string;         // "Peak Hours Surcharge"
  factor: number;        // 1.5 pentru +50%
  applies_to: string[];  // ['base_fare', 'distance_fee']
}

interface QuoteSummary {
  subtotal_pence: number;   // Suma componentelor înainte de discount
  discount_pence: number;   // Total discount aplicat
  vat_pence: number;        // VAT la 20%
  total_pence: number;      // Total final
}

interface QuoteMetadata {
  calc_source: string;      // "pricing_engine_v2"
  calc_version: string;     // "2.0.0"
  calculated_at?: string;   // ISO timestamp
}
```

### Exemplu Real
```json
{
  "components": [
    {
      "code": "base_fare",
      "label": "Base fare",
      "amount_pence": 12000
    },
    {
      "code": "distance_fee",
      "label": "Distance fee",
      "amount_pence": 13037
    },
    {
      "code": "time_fee",
      "label": "Time fee",
      "amount_pence": 2700
    },
    {
      "code": "additional_fees",
      "label": "Additional fees",
      "amount_pence": 500
    }
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

### Reguli de Validare
- ✅ `components` TREBUIE să fie array (poate fi gol)
- ✅ Fiecare component TREBUIE să aibă `code`, `label`, `amount_pence`
- ✅ Toate valorile TREBUIE să fie în PENCE (integer)
- ✅ `summary.subtotal_pence` = sum(components) - sum(discounts)
- ✅ `summary.vat_pence` = subtotal_pence * 0.20 (rotunjit)
- ✅ `summary.total_pence` = subtotal_pence + vat_pence
- ✅ `meta.calc_source` și `calc_version` OBLIGATORII

---

## 2. CLIENT_LEG_QUOTES.line_items

### Schema TypeScript
```typescript
interface LegQuoteLineItems {
  // Componente pricing specifice leg-ului
  components: PricingComponent[];
  
  // Discount-uri specifice leg-ului
  discounts: Discount[];
  
  // Multiplicatori specifici leg-ului
  multipliers: Multiplier[];
  
  // Sumar financiar leg
  summary: LegQuoteSummary;
  
  // Metadata
  meta?: {
    leg_number: number;
    leg_kind: 'main' | 'return' | 'additional';
  };
}

interface LegQuoteSummary {
  subtotal_pence: number;
  discount_pence: number;
  vat_pence: number;
  total_pence: number;
}
```

### Exemplu Real
```json
{
  "components": [
    {
      "code": "base_fare",
      "label": "Base fare",
      "amount_pence": 12000
    },
    {
      "code": "distance_fee",
      "label": "Distance fee",
      "amount_pence": 8500
    }
  ],
  "discounts": [],
  "multipliers": [],
  "summary": {
    "subtotal_pence": 20500,
    "discount_pence": 0,
    "vat_pence": 4100,
    "total_pence": 24600
  },
  "meta": {
    "leg_number": 1,
    "leg_kind": "main"
  }
}
```

---

## 3. INTERNAL_BOOKING_FINANCIALS.line_items

### Schema TypeScript
```typescript
interface BookingFinancialLineItems {
  // Sursa datelor
  source: 'quote_snapshot' | 'manual_override' | 'system_adjustment';
  
  // Referință la quote source
  quote_id: string;
  
  // Componente copiate din quote
  components: PricingComponent[];
  
  // Discount-uri copiate din quote
  discounts: Discount[];
  
  // Multiplicatori copiați din quote
  multipliers: Multiplier[];
  
  // Sumar financiar complet
  summary: FinancialSummary;
  
  // Comisioane calculate
  commissions: CommissionBreakdown;
  
  // Referințe la leg financials
  leg_financial_ids: string[];
}

interface FinancialSummary {
  subtotal_pence: number;
  discount_pence: number;
  vat_pence: number;
  gross_amount_pence: number;      // = subtotal + vat
  subtotal_ex_vat_pence: number;   // = subtotal - discount
}

interface CommissionBreakdown {
  platform_fee_pence: number;
  platform_fee_rate_bp: number;    // Basis points (1000 = 10%)
  operator_fee_pence: number;
  operator_fee_rate_bp: number;
  driver_payout_pence: number;
}
```

### Exemplu Real
```json
{
  "source": "quote_snapshot",
  "quote_id": "8bf402d1-f3ee-4731-a371-33515e4c1159",
  "components": [
    {
      "code": "base_fare",
      "label": "Base fare",
      "amount_pence": 12000
    },
    {
      "code": "distance_fee",
      "label": "Distance fee",
      "amount_pence": 13037
    },
    {
      "code": "time_fee",
      "label": "Time fee",
      "amount_pence": 2700
    },
    {
      "code": "additional_fees",
      "label": "Additional fees",
      "amount_pence": 500
    }
  ],
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

### Reguli de Validare
- ✅ `source` OBLIGATORIU
- ✅ `quote_id` OBLIGATORIU dacă source = 'quote_snapshot'
- ✅ `commissions.platform_fee_pence + operator_fee_pence + driver_payout_pence` = `summary.subtotal_ex_vat_pence`
- ✅ `platform_fee_rate_bp` / 10000 aplicat pe subtotal_ex_vat → platform_fee_pence
- ✅ `operator_fee_rate_bp` / 10000 aplicat pe (subtotal_ex_vat - platform_fee) → operator_fee_pence

---

## 4. INTERNAL_LEG_FINANCIALS.line_items

### Schema TypeScript
```typescript
interface LegFinancialLineItems {
  // Sursa datelor
  source: 'quote_snapshot' | 'manual_override';
  
  // Referință la leg quote
  leg_quote_id?: string;
  
  // Pricing specifice leg-ului
  pricing: LegPricing;
  
  // Componente copiate din leg quote
  components: PricingComponent[];
  
  // Comisioane calculate pentru leg
  commissions: LegCommissionBreakdown;
}

interface LegPricing {
  subtotal_pence: number;
  vat_pence: number;
  total_pence: number;
}

interface LegCommissionBreakdown {
  platform_fee_pence: number;
  operator_fee_pence: number;
  driver_payout_pence: number;
}
```

### Exemplu Real
```json
{
  "source": "quote_snapshot",
  "leg_quote_id": "abc-123-xyz",
  "pricing": {
    "subtotal_pence": 20500,
    "vat_pence": 4100,
    "total_pence": 24600
  },
  "components": [
    {
      "code": "base_fare",
      "label": "Base fare",
      "amount_pence": 12000
    },
    {
      "code": "distance_fee",
      "label": "Distance fee",
      "amount_pence": 8500
    }
  ],
  "commissions": {
    "platform_fee_pence": 2050,
    "operator_fee_pence": 1845,
    "driver_payout_pence": 16605
  }
}
```

---

## Migration Strategy (FUTURE)

**NU acum** - doar plan pentru viitor:

### Phase 1: Add Validation
- Adaugă constraints DB pentru a valida structura JSON
- Adaugă unit tests pentru validare

### Phase 2: Backfill
- Migrare quote-uri vechi la format nou
- Păstrează backup înainte de migrare

### Phase 3: Enforce
- Fă validarea STRICT
- Reject quotes cu format vechi

---

## Code Constants

```typescript
// src/types/line-items.types.ts
export const LINE_ITEMS_VERSION = '1.0.0';

export const COMPONENT_CODES = {
  BASE_FARE: 'base_fare',
  DISTANCE_FEE: 'distance_fee',
  TIME_FEE: 'time_fee',
  ADDITIONAL_FEES: 'additional_fees',
  AIRPORT_SUPPLEMENT: 'airport_supplement',
  PEAK_HOURS: 'peak_hours',
  TOLLS: 'tolls',
} as const;

export const DISCOUNT_CODES = {
  PROMO_CODE: 'promo_code',
  LOYALTY: 'loyalty',
  CORPORATE: 'corporate',
  SEASONAL: 'seasonal',
} as const;

export const MULTIPLIER_CODES = {
  SURGE: 'surge',
  PEAK_HOURS: 'peak_hours',
  SEASONAL: 'seasonal',
  DEMAND: 'demand',
} as const;

export const LINE_ITEMS_SOURCE = {
  QUOTE_SNAPSHOT: 'quote_snapshot',
  MANUAL_OVERRIDE: 'manual_override',
  SYSTEM_ADJUSTMENT: 'system_adjustment',
} as const;
```

---

## Validation Functions

```typescript
// src/utils/line-items-validator.ts
export function validateQuoteLineItems(lineItems: any): boolean {
  if (!lineItems.components || !Array.isArray(lineItems.components)) {
    return false;
  }
  
  if (!lineItems.summary || typeof lineItems.summary !== 'object') {
    return false;
  }
  
  if (!lineItems.meta || !lineItems.meta.calc_source) {
    return false;
  }
  
  // Validate components
  for (const comp of lineItems.components) {
    if (!comp.code || !comp.label || typeof comp.amount_pence !== 'number') {
      return false;
    }
  }
  
  // Validate summary math
  const calculatedSubtotal = lineItems.components.reduce(
    (sum, c) => sum + c.amount_pence, 
    0
  );
  
  if (calculatedSubtotal !== lineItems.summary.subtotal_pence) {
    return false;
  }
  
  return true;
}

export function validateFinancialLineItems(lineItems: any): boolean {
  if (!lineItems.source || !lineItems.quote_id) {
    return false;
  }
  
  if (!lineItems.commissions) {
    return false;
  }
  
  // Validate commission math
  const {
    platform_fee_pence,
    operator_fee_pence,
    driver_payout_pence
  } = lineItems.commissions;
  
  const total = platform_fee_pence + operator_fee_pence + driver_payout_pence;
  
  if (total !== lineItems.summary.subtotal_ex_vat_pence) {
    return false;
  }
  
  return true;
}
```

---

## Summary

✅ **Standard definit pentru:**
- client_booking_quotes.line_items
- client_leg_quotes.line_items  
- internal_booking_financials.line_items
- internal_leg_financials.line_items

✅ **Toate valorile în PENCE**

✅ **Structură consistentă:**
- components[] pentru breakdown
- discounts[] pentru reduceri
- multipliers[] pentru surge/peak
- summary pentru totals
- meta pentru tracking
- commissions pentru fees (doar internal)

✅ **Validare math automată**

✅ **TypeScript types definite**

✅ **Nu necesită migrații ACUM** - format actual deja corect!

# Automated Tests Plan - Financial Flow Refactored

## Priority 1: Critical Flow Tests

### 1.1 QuoteService Tests
```typescript
describe('QuoteService.createQuote()', () => {
  it('should create booking quote with new line_items format', async () => {
    // Given: valid pricing result
    // When: createQuote() called
    // Then: quote created with components[], summary, meta
    // Verify: all values in PENCE
  });

  it('should handle quotes with RLS active (service role)', async () => {
    // Verify: service role key bypasses RLS
    // Verify: quote successfully inserted
  });

  it('should create leg quotes when pricing has legs', async () => {
    // Given: pricing result with legs
    // When: createQuote() called  
    // Then: booking quote + leg quotes created
  });

  it('should calculate VAT correctly at 20%', async () => {
    // Given: subtotal 10000 pence
    // When: createQuote() called
    // Then: vat_pence = 2000, total_pence = 12000
  });
});
```

### 1.2 FinancialSnapshotService Tests
```typescript
describe('FinancialSnapshotService.createFinancialSnapshot()', () => {
  it('should create financial snapshot from quote', async () => {
    // Given: valid quote ID
    // When: createFinancialSnapshot() called
    // Then: internal_booking_financials record created
  });

  it('should calculate commissions correctly', async () => {
    // Given: subtotal_ex_vat = 28237, platform=10%, operator=9%
    // When: createFinancialSnapshot() called
    // Then: platform_fee = 2824, operator_fee = 2287, driver = 23126
  });

  it('should fetch quote without embedded relation error', async () => {
    // Given: quote with separate leg quotes
    // When: getQuote() called
    // Then: booking quote + leg quotes returned separately
  });

  it('should work with RLS active', async () => {
    // Verify: service role bypasses RLS
    // Verify: financial snapshot created successfully
  });

  it('should NOT populate booking_line_items', async () => {
    // Given: financial snapshot created
    // When: query booking_line_items
    // Then: COUNT = 0 for pricing components
  });
});
```

---

## Priority 2: Data Integrity Tests

### 2.1 Line Items Format Validation
```typescript
describe('Quote line_items format', () => {
  it('should have components array with code, label, amount_pence', () => {});
  it('should have discounts array', () => {});
  it('should have multipliers array', () => {});
  it('should have summary with all totals in pence', () => {});
  it('should have meta with calc_source and version', () => {});
});

describe('Financial line_items format', () => {
  it('should have source = "quote_snapshot"', () => {});
  it('should have quote_id reference', () => {});
  it('should have commissions with all fees in pence', () => {});
  it('should have components copied from quote', () => {});
});
```

### 2.2 Commission Calculations
```typescript
describe('Commission edge cases', () => {
  it('should handle zero subtotal', () => {});
  it('should handle null organization settings gracefully', () => {});
  it('should round commissions correctly', () => {});
  it('should validate platform_fee + operator_fee + driver_payout = subtotal_ex_vat', () => {});
});
```

---

## Priority 3: Integration Tests

### 3.1 End-to-End Flow
```typescript
describe('Complete booking financial flow', () => {
  it('should complete: create booking -> quote -> confirm -> financial snapshot', async () => {
    // 1. Create booking (status: NEW)
    // 2. Calculate pricing
    // 3. Create quote (QuoteService)
    // 4. Confirm booking (status: CONFIRMED)
    // 5. Create financial snapshot (FinancialSnapshotService)
    // Verify: all data correct in DB
  });

  it('should handle multi-leg bookings', async () => {
    // Given: booking with 2 legs
    // When: complete flow
    // Then: booking quote + 2 leg quotes + booking financial + 2 leg financials
  });
});
```

### 3.2 RLS & Security
```typescript
describe('RLS and security', () => {
  it('should allow service role to create quotes', () => {});
  it('should allow service role to create financial snapshots', () => {});
  it('should block anon key from creating internal financials', () => {});
  it('should allow authenticated users to read own quotes', () => {});
});
```

---

## Priority 4: Regression Tests

### 4.1 Deprecated Tables
```typescript
describe('booking_line_items deprecation', () => {
  it('should NOT insert pricing components (base_fare, distance_fee, etc.)', () => {});
  it('should remain empty after financial snapshot creation', () => {});
});
```

### 4.2 Backward Compatibility
```typescript
describe('Legacy support', () => {
  it('should still read old quotes with legacy format (if exist)', () => {});
  it('should handle missing line_items gracefully', () => {});
});
```

---

## Test Framework Recommendations

**Framework:** Vitest (already configured)

**Structure:**
```
tests/
├── unit/
│   ├── services/
│   │   ├── QuoteService.test.ts
│   │   └── FinancialSnapshotService.test.ts
│   └── utils/
├── integration/
│   ├── financial-flow.test.ts
│   └── rls-policies.test.ts
└── e2e/
    └── complete-booking-flow.test.ts
```

**Coverage Target:** 80%+ for services, 60%+ overall

**CI/CD:** Run tests on every PR, block merge if tests fail

---

## Mock Strategy

- **Database:** Use Supabase test project or local instance
- **Organization settings:** Mock with known values (platform: 0.10, operator: 0.09)
- **Pricing engine:** Mock with predictable results
- **RLS:** Test with both service role and anon keys

---

## Test Data Fixtures

```typescript
export const FIXTURES = {
  organization: {
    id: 'test-org-uuid',
    platform_commission_pct: 0.10,
    operator_commission_pct: 0.09
  },
  pricingResult: {
    subtotal: 28237,
    discount: 0,
    vat: 5647,
    total: 33884,
    components: [
      { code: 'base_fare', label: 'Base fare', amount_pence: 12000 },
      { code: 'distance_fee', label: 'Distance fee', amount_pence: 13037 },
      { code: 'time_fee', label: 'Time fee', amount_pence: 2700 },
      { code: 'additional_fees', label: 'Additional fees', amount_pence: 500 }
    ]
  },
  booking: {
    id: 'test-booking-uuid',
    status: 'NEW',
    organization_id: 'test-org-uuid'
  }
};
```

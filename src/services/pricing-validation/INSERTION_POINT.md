# Pricing validation — suggested insertion point (Phase 0+)

**Do not activate in production until Phase 1.**

## Primary hook (independent quotes)

File: `src/api/pricing/calculate-and-quote.ts`

After `PricingEngine.calculate` succeeds and **before** `QuotePersistenceService.createIndependentQuote`:

```typescript
import { pricingValidationService } from '../../services/pricing-validation';
import { QuoteEconomicsSnapshot } from '../../services/pricing-validation';

// Build snapshot from pricingResult + commissions (mapper TBD in Phase 1)
const economicsSnapshot = QuoteEconomicsSnapshot.fromInput({ /* ... */ });
const validation = await pricingValidationService.validate(economicsSnapshot);

if (!validation.ok) {
  return res.status(422).json({
    success: false,
    error: 'Pricing validation failed',
    violations: validation.violations,
  });
}
```

## Fleet

- `isFleet: true` on the parent snapshot with aggregated pence fields.
- `legs[]` with per-leg `bookingType` (`oneway` | `return` | `hourly` | `daily`).
- Rules with `booking_type IS NULL` apply to all legs and aggregated checks.

## Bespoke

- `bookingType: 'bespoke'` → validation skipped (`skipped: true`, `ok: true`).

## Out of scope (Phase 0)

- Auto-raise client total, analytics, HMRC, infra costs, AI pricing, admin UI.
- Changes to `PricingEngine`, payout engine, Stripe, VAT, driver app, notifications.

## Database

Apply `migrations/20260520120000_pricing_validation_rules.sql` on Supabase before enabling rule loading.

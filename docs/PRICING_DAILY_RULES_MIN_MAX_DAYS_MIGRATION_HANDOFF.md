# Draft migration handoff — `pricing_daily_rules.minimum_days` / `maximum_days`

**Status:** Forward migration draft + **Phase 1 code implemented** (backend clamp, admin UI, website local).  
**Apply SQL** to Supabase before testing website API or production quotes.

| Artifact | Path |
|----------|------|
| Forward SQL (draft) | `migrations/20260524190000_pricing_daily_rules_min_max_days.sql` |
| Rollback SQL (draft) | `migrations/20260524190000_pricing_daily_rules_min_max_days_rollback.sql` |

---

## 1. Draft SQL migration (summary)

**Approach:** nullable add → backfill → NOT NULL → defaults → CHECK constraints → optional UNIQUE index → recreate `v_pricing_daily_rules`.

**Why not a new table:** Keeps modular split — `pricing_vehicle_rates` = money, `pricing_daily_rules` = package + duration rules (same as hourly).

---

## 2. Constraints

| Constraint | Rule |
|----------|------|
| `pricing_daily_rules_minimum_days_positive` | `minimum_days >= 1` |
| `pricing_daily_rules_max_days_gte_min` | `maximum_days >= minimum_days` |
| `pricing_daily_rules_max_days_sane` | `maximum_days <= 365` |
| `NOT NULL` | Both columns after backfill |

**Not added (by design):**

- No FK beyond existing `organization_id`, `pricing_version_id`, `vehicle_category_id`
- No cross-table CHECK to `pricing_hourly_rules` (independent booking modes)

---

## 3. Defaults

| Column | Backfill | `DEFAULT` for new rows |
|--------|----------|-------------------------|
| `minimum_days` | `1` | `1` |
| `maximum_days` | `30` | `30` |

**Rationale:**

- `minimum_days = 1` matches current engine (`request.days || 1`) and website fallback.
- `maximum_days = 30` matches current website selector cap.

**Before apply:** confirm product wants 30 vs 14/90 for max daily hire.

**Per-category overrides:** after migration, edit rows in Admin per `vehicle_category_id` + active `pricing_version_id` (e.g. SUV stricter max).

---

## 4. Optional unique index (recommended)

```sql
CREATE UNIQUE INDEX uq_pricing_daily_rules_org_version_vehicle
  ON pricing_daily_rules (organization_id, pricing_version_id, vehicle_category_id);
```

| Aspect | Assessment |
|--------|------------|
| **Safety today** | Pre-check: 0 duplicate `(org, version, vehicle)` groups in production |
| **Benefit** | Prevents accidental double rules on version clone / admin insert |
| **Risk** | Fails if hidden duplicates exist in another org — run duplicate query before apply |
| **Symmetry** | Mirrors `uq_pricing_vehicle_rates_org_version_vehicle_type` on rates |

**Rollback:** `DROP INDEX uq_pricing_daily_rules_org_version_vehicle`

---

## 5. Rollback safety

| Step | Rollback action |
|------|-----------------|
| View | Recreate without `minimum_days` / `maximum_days` |
| Index | `DROP INDEX uq_pricing_daily_rules_org_version_vehicle` |
| Constraints | Drop three CHECK constraints |
| Columns | `DROP COLUMN maximum_days, minimum_days` |

**Safe if:**

- Forward migration applied in a transaction (BEGIN/COMMIT in draft).
- No other migrations depend on these columns yet.

**Unsafe if:**

- Backend/website already deployed reading columns — rollback requires **deploy rollback first**, then SQL rollback.

**Order of operations for production rollback:**

1. Revert backend clamp (or tolerate missing columns).
2. Revert website API.
3. Run rollback SQL.
4. Revert admin UI.

---

## 6. Required backend changes (after SQL apply)

**Repo:** `Backend-VantageLane-`

### 6.1 `FeeCalculators.calculateDailyFee`

**File:** `src/services/FeeCalculators.ts`

**Current:**

```typescript
const billableDays = requestedDays; // No min/max in current schema
```

**Required:**

```typescript
const billableDays = Math.min(
  Math.max(requestedDays, dailyRules.minimum_days),
  dailyRules.maximum_days
);
```

**Optional:** add breakdown detail when clamp applied (e.g. “3 days requested, billed at 3 days (min 1)”).

### 6.2 `PricingDataService.getDailyRules`

**File:** `src/services/PricingDataService.ts`

- Already `select *` from `v_pricing_daily_rules` — **no query change** once view exposes columns.
- Invalidate cache key or bump TTL after migration deploy.

### 6.3 Types (optional cleanup)

**File:** `src/types/pricing.types.ts`

- Align `daily_settings.minimum_days` / `maximum_days` docs with DB-backed rules.

### 6.4 Tests

- Add unit/integration test: `days=0` or `days=1` with `minimum_days=2` → bills 2.
- Fleet daily: same clamp via `calculateDailyFee` + `baseServiceType: daily`.

**No change to:** `pricing_vehicle_rates`, `organization_settings`, quote request schema (`days` still sent as user selection; engine clamps).

---

## 7. Required admin changes

**Repo:** `ADMIN-2026`

| Area | Change |
|------|--------|
| `pricing_daily_rules` columns | Add `minimum_days` (number), `maximum_days` (number) to `COLS` in `prices/page.tsx` or `pricingAdminColumns.ts` |
| Labels | `Min days`, `Max days` (English) |
| Daily banner | Update `DailyEngineNotice` — remove “minimum_days not in DB” note after apply |
| Docs | Update `docs/DAILY_PRICING_ENGINE_CONTRACT.md` — engine **uses** min/max after backend deploy |

**Do not** put min/max on Vehicle Rates tab — wrong table.

**Versioning:** Admin already scopes by `pricing_version_id`; new fields follow same PATCH path as `included_hours`.

---

## 8. Required website changes

**Repo:** `vantage-lane-2.0` (partially prepared locally)

| Area | Change |
|------|--------|
| `GET /api/pricing/booking-rules` | Select `minimum_days`, `maximum_days` from `v_pricing_daily_rules`; set `meta.minimum_days_source = 'database'` |
| Aggregation | `daily.minimum_days` = MAX per category (strictest for Step 1); `daily.maximum_days` = MIN of category maximums (tightest cap) — mirror hourly logic |
| Remove fallback | Delete hardcoded `FALLBACK_MINIMUM_DAYS = 1` once DB live |
| `DaysDurationSelector` | Already consumes rules from store |
| `docs/WEBSITE_PRICING_VALIDATION_HANDOFF_CRISTI.md` | Update §11 remaining issues |

**Deploy order:** SQL migrate → backend clamp → website API → admin (any order if website keeps fallback until API updated).

---

## 9. Risks before apply

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Product default max=30 wrong** | Medium | Confirm with ops; adjust backfill UPDATE before apply |
| **Engine clamp changes quoted price** | Medium | Users below old implicit min still paid fewer days; after clamp, min enforced — communicate |
| **Multi-org active versions** | Low | `getActivePricingVersion()` without org filter — separate issue; views still filter by `organization_id` on read |
| **View dependency** | Medium | Any materialized view / RPC listing columns must be updated; grep `v_pricing_daily_rules` |
| **Supabase types regen** | Low | Regenerate TS types if used in CI |
| **Rollback with deployed backend** | High | Deploy order + rollback SQL only after code revert |
| **Unique index on legacy data** | Low | Pre-flight duplicate query in forward migration (0 today on VL) |
| **Inactive duplicate rows** | Low | Unique applies to all rows, not only `active=true` — do not seed two rows same triple |

### Pre-apply checklist (Cristi)

```sql
-- Duplicates (must return 0 rows before unique index)
SELECT organization_id, pricing_version_id, vehicle_category_id, COUNT(*)
FROM pricing_daily_rules
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1;

-- Null version rows (investigate if any)
SELECT COUNT(*) FROM pricing_daily_rules WHERE pricing_version_id IS NULL;

-- Current view definition backup (already in rollback file)
SELECT pg_get_viewdef('v_pricing_daily_rules'::regclass, true);
```

### Apply checklist (when approved)

1. Run forward migration on staging Supabase.
2. Verify: `SELECT minimum_days, maximum_days FROM v_pricing_daily_rules LIMIT 5;`
3. Deploy backend with clamp.
4. Deploy admin + website.
5. Smoke: daily booking 1 day, max day, fleet daily, quote breakdown days text.

---

## 10. Architecture validation (final)

| Principle | Preserved? |
|-----------|------------|
| Modular tables | Yes — extends rules table only |
| Multi-tenant | Yes — `organization_id` on every row |
| Pricing versioning | Yes — `pricing_version_id` + view join to active version |
| No giant pricing table | Yes — 2 columns, not merged into `pricing_vehicle_rates` |
| Symmetry with hourly | Yes — `minimum_hours`/`maximum_hours` ↔ `minimum_days`/`maximum_days` |

**Recommendation:** Approve draft SQL as-is for staging review; adjust `maximum_days` default if product requires before production apply.

---

*End of handoff — LOCAL DRAFT ONLY.*

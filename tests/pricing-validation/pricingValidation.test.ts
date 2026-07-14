/**
 * Phase 0 scaffolding — run: npm run test:pricing-validation
 */
import assert from 'node:assert/strict';
import { PricingValidationService } from '../../src/services/pricing-validation/PricingValidationService';
import { QuoteEconomicsSnapshot } from '../../src/services/pricing-validation/QuoteEconomicsSnapshot';
import {
  PricingValidationRuleRow,
} from '../../src/services/pricing-validation/pricingValidation.types';
import { baseSnapshot, minClientTotalRule } from './fixtures';

const service = new PricingValidationService();

async function run(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  console.log(`  ✓ ${name}`);
}

async function main(): Promise<void> {
  console.log('pricing-validation (Phase 0 scaffold)\n');

  await run('oneway passes when client total above threshold', () => {
    const snap = QuoteEconomicsSnapshot.fromInput(
      baseSnapshot({ bookingType: 'oneway', clientTotalPence: 20000 })
    );
    const result = service.validateSnapshot(snap, {
      rules: [minClientTotalRule(15000, 'oneway')],
    });
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);
  });

  await run('oneway fails when client total below threshold', () => {
    const snap = QuoteEconomicsSnapshot.fromInput(
      baseSnapshot({ bookingType: 'oneway', clientTotalPence: 10000 })
    );
    const result = service.validateSnapshot(snap, {
      rules: [minClientTotalRule(15000, 'oneway')],
    });
    assert.equal(result.ok, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].ruleCode, 'client_total_min');
  });

  await run('hourly uses booking_type filter', () => {
    const snap = QuoteEconomicsSnapshot.fromInput(
      baseSnapshot({ bookingType: 'hourly', clientTotalPence: 12000 })
    );
    const result = service.validateSnapshot(snap, {
      rules: [
        minClientTotalRule(15000, 'oneway'),
        minClientTotalRule(10000, 'hourly'),
      ],
    });
    assert.equal(result.ok, true);
  });

  await run('daily violation is blocking', () => {
    const snap = QuoteEconomicsSnapshot.fromInput(
      baseSnapshot({ bookingType: 'daily', clientTotalPence: 5000 })
    );
    const result = service.validateSnapshot(snap, {
      rules: [minClientTotalRule(8000, 'daily')],
    });
    assert.equal(result.ok, false);
    assert.equal(result.violations[0].onFail, 'block');
  });

  await run('fleet validates per-leg and aggregated', () => {
    const snap = QuoteEconomicsSnapshot.fromInput(
      baseSnapshot({
        bookingType: 'oneway',
        isFleet: true,
        clientTotalPence: 30000,
        legs: [
          {
            legIndex: 0,
            bookingType: 'oneway',
            clientTotalPence: 8000,
            clientNetPence: 7000,
            estimatedDriverPence: 5000,
            operatorCommissionPence: 1500,
            platformFeePence: 300,
            distanceMiles: 10,
            durationMinutes: 25,
          },
          {
            legIndex: 1,
            bookingType: 'hourly',
            clientTotalPence: 22000,
            clientNetPence: 18000,
            estimatedDriverPence: 12000,
            operatorCommissionPence: 4000,
            platformFeePence: 800,
            distanceMiles: 0,
            durationMinutes: 120,
          },
        ],
      })
    );
    const result = service.validateSnapshot(snap, {
      rules: [
        minClientTotalRule(10000, 'oneway'),
        minClientTotalRule(20000, 'hourly'),
        minClientTotalRule(35000, null, 'agg'),
      ],
    });
    assert.equal(result.ok, false);
    const leg0 = result.violations.find((v) => v.legIndex === 0);
    const agg = result.violations.find((v) => v.scope === 'aggregated');
    assert.ok(leg0, 'leg 0 should fail min 10000');
    assert.ok(agg, 'aggregated should fail min 25000');
  });

  await run('vehicle category rule matches canonical text id', () => {
    const snap = QuoteEconomicsSnapshot.fromInput(
      baseSnapshot({ vehicleCategoryId: 'executive', clientTotalPence: 5000 })
    );
    const rule: PricingValidationRuleRow = {
      ...minClientTotalRule(10000, 'oneway', 'exec-cat'),
      vehicle_category_id: 'executive',
    };
    const wrongCat: PricingValidationRuleRow = {
      ...minClientTotalRule(10000, 'oneway', 'lux-cat'),
      vehicle_category_id: 'luxury',
    };
    const result = service.validateSnapshot(snap, {
      rules: [rule, wrongCat],
    });
    assert.equal(result.ok, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].ruleId, rule.id);
  });

  await run('bespoke skips validation', () => {
    const snap = QuoteEconomicsSnapshot.fromInput(
      baseSnapshot({ bookingType: 'bespoke', clientTotalPence: 1 })
    );
    const result = service.validateSnapshot(snap, {
      rules: [minClientTotalRule(999999)],
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.skipReason, 'bespoke');
  });

  await run('no rules skips with ok', () => {
    const snap = QuoteEconomicsSnapshot.fromInput(baseSnapshot());
    const result = service.validateSnapshot(snap, {});
    assert.equal(result.ok, true);
    assert.equal(result.skipReason, 'no_active_rules');
  });

  console.log('\nAll pricing-validation scaffold tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Daily billable days clamp — mirrors FeeCalculators.calculateDailyFee logic.
 * Run: npx ts-node tests/daily-fee-clamp.test.ts
 */

function billableDays(requested: number, minimumDays: number, maximumDays: number): number {
  const min = minimumDays > 0 ? minimumDays : 1;
  const max = maximumDays >= min ? maximumDays : min;
  return Math.min(Math.max(requested, min), max);
}

function assertEq(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`OK ${label}`);
}

assertEq(billableDays(1, 2, 10), 2, 'minimum_days=2 blocks 1 day');
assertEq(billableDays(15, 2, 10), 10, 'maximum_days=10 clamps 15 days');
assertEq(billableDays(3, 2, 10), 3, 'in-range days unchanged');
assertEq(billableDays(1, 1, 30), 1, 'default min 1 allows 1 day');

console.log('daily-fee-clamp: all passed');

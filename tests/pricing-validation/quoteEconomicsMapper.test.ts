/**
 * Phase 1C — QuoteEconomicsMapper unit tests (commission math, no DB).
 * Run: npx ts-node tests/pricing-validation/quoteEconomicsMapper.test.ts
 */

import { QuoteEconomicsMapper } from '../../src/services/pricing-validation/QuoteEconomicsMapper';
import { BookingType, PricingResult, VehicleType } from '../../src/types/pricing.types';
import { QUOTE_ECONOMICS_SNAPSHOT_VERSION } from '../../src/types/quoteEconomics.types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function makePricingResult(finalPrice: number, serviceItemFees = 0): PricingResult {
  return {
    success: true,
    finalPrice,
    currency: 'GBP',
    pricing_version_id: 'pv-test-001',
    bookingBreakdown: {
      baseFare: finalPrice - serviceItemFees,
      distanceFee: 0,
      timeFee: 0,
      airportFees: 0,
      zoneFees: 0,
      tollFees: 0,
      multiStopFees: 0,
      waitingFees: 0,
      serviceItemFees,
      subtotal: finalPrice,
      multipliers: {},
      discounts: { total: 0 },
      finalPrice,
      details: [],
    },
    timestamp: new Date().toISOString(),
  };
}

async function runTests(): Promise<void> {
  const orgSettings = {
    platform_commission_pct: 0.1,
    operator_commission_pct: 0.1,
    vat_rate: 0.2,
  };

  const financialSettings = {
    organization_id: 'org-test',
    vat_rate: 0.2,
    vat_enabled: true,
    processor_fee_pct: 0.014,
    processor_fixed_fee_pence: 20,
    default_operational_reserve_pence: 500,
    hourly_operational_reserve_pence: 1000,
    daily_operational_reserve_pence: 2000,
    fleet_operational_reserve_pence: 3000,
    low_margin_warning_pct: 0.1,
    minimum_profit_pence: 0,
  };

  const pricingResult = makePricingResult(100); // £100 net
  const normalizedRequest = {
    bookingType: BookingType.ONE_WAY,
    organizationId: 'org-test',
    vehicleType: VehicleType.EXECUTIVE,
    dateTime: new Date().toISOString(),
    pickup: { address: 'A', coordinates: { lat: 51.5, lng: -0.1 } },
    dropoff: { address: 'B', coordinates: { lat: 51.6, lng: -0.2 } },
    additionalStops: [],
    distance: 10,
    duration: 30,
    extras: [],
  } as import('../../src/types/pricing.types').NormalizedOneWayRequest;

  const snapshot = await QuoteEconomicsMapper.buildSnapshot({
    pricingResult,
    normalizedRequest,
    organizationId: 'org-test',
    organizationSettings: orgSettings,
    financialSettings,
  });

  assert(snapshot.schema_version === QUOTE_ECONOMICS_SNAPSHOT_VERSION, 'schema version');
  assert(snapshot.client_net_pence === 10000, 'client net £100');
  assert(snapshot.vat_pence === 2000, 'VAT 20% on net');
  assert(snapshot.client_gross_pence === 12000, 'gross incl VAT');
  assert(snapshot.estimated_platform_fee_pence === 1000, 'platform 10% of net');
  assert(snapshot.operational_reserve_pence === 500, 'default reserve');
  assert(snapshot.estimated_processor_fee_pence === 188, '1.4% of 12000 + 20');
  assert(typeof snapshot.estimated_margin_pct === 'number', 'margin pct present');
  assert(snapshot.generated_at.length > 0, 'generated_at set');

  const validationInput = QuoteEconomicsMapper.toValidationInput(snapshot);
  assert(validationInput.clientTotalPence === snapshot.client_gross_pence, 'validation bridge');

  console.log('✅ quoteEconomicsMapper.test.ts — all assertions passed');
  console.log(JSON.stringify(snapshot, null, 2));
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

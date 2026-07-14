import {
  PricingValidationRuleRow,
  QuoteEconomicsSnapshotInput,
} from '../../src/services/pricing-validation/pricingValidation.types';

export const ORG_ID = '00000000-0000-4000-8000-000000000001';
export const VEHICLE_CAT = 'executive' as const;

export function baseSnapshot(
  overrides: Partial<QuoteEconomicsSnapshotInput> = {}
): QuoteEconomicsSnapshotInput {
  return {
    bookingType: 'oneway',
    isFleet: false,
    organizationId: ORG_ID,
    vehicleCategoryId: VEHICLE_CAT,
    clientTotalPence: 15000,
    clientNetPence: 12500,
    estimatedDriverPence: 9000,
    operatorCommissionPence: 3000,
    platformFeePence: 500,
    distanceMiles: 12.5,
    durationMinutes: 35,
    ...overrides,
  };
}

export function minClientTotalRule(
  thresholdPence: number,
  bookingType: PricingValidationRuleRow['booking_type'] = null,
  idSuffix = 'default'
): PricingValidationRuleRow {
  return {
    id: `rule-${idSuffix}-${bookingType ?? 'all'}-client-min`,
    organization_id: ORG_ID,
    booking_type: bookingType,
    vehicle_category_id: null,
    rule_code: 'client_total_min',
    threshold_value: thresholdPence,
    threshold_mode: 'gte',
    on_fail: 'block',
    priority: 100,
    is_active: true,
  };
}

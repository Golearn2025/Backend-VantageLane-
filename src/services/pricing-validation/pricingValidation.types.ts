/**
 * Pricing validation layer — Phase 0 types only.
 * Separate from PricingEngine; payload-first economics snapshots.
 */

/**
 * Canonical vehicle category IDs — aligned with pricing engine / booking legs / payout.
 * Do not use UUIDs for category matching in validation rules.
 */
export type CanonicalVehicleCategoryId = 'executive' | 'luxury' | 'suv' | 'mpv';

/** Leg booking types only. Fleet is a wrapper, not a booking type. */
export type PricingValidationBookingType =
  | 'oneway'
  | 'return'
  | 'hourly'
  | 'daily'
  | 'bespoke';

export type ValidationThresholdMode = 'gte' | 'lte' | 'pct_gte' | 'pct_lte';

export type ValidationOnFail = 'block' | 'warn';

/** Maps rule_code → snapshot field or derived ratio. */
export type ValidationRuleCode =
  | 'client_total_min'
  | 'client_net_min'
  | 'operator_commission_min'
  | 'platform_fee_min'
  | 'estimated_driver_max'
  | 'operator_margin_pct_min';

export interface PricingValidationRuleRow {
  id: string;
  organization_id: string;
  booking_type: PricingValidationBookingType | null;
  vehicle_category_id: CanonicalVehicleCategoryId | null;
  rule_code: ValidationRuleCode | string;
  threshold_value: number;
  threshold_mode: ValidationThresholdMode;
  on_fail: ValidationOnFail;
  priority: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface QuoteEconomicsSnapshotInput {
  bookingType: PricingValidationBookingType;
  isFleet: boolean;
  organizationId: string;
  vehicleCategoryId?: CanonicalVehicleCategoryId | null;
  clientTotalPence: number;
  clientNetPence: number;
  estimatedDriverPence: number;
  operatorCommissionPence: number;
  platformFeePence: number;
  distanceMiles: number;
  durationMinutes: number;
  /** Fleet only: per-leg economics (each leg has its own bookingType). */
  legs?: QuoteEconomicsLegInput[];
}

export interface QuoteEconomicsLegInput {
  legIndex: number;
  bookingType: Exclude<PricingValidationBookingType, 'bespoke'>;
  clientTotalPence: number;
  clientNetPence: number;
  estimatedDriverPence: number;
  operatorCommissionPence: number;
  platformFeePence: number;
  distanceMiles: number;
  durationMinutes: number;
}

export interface PricingValidationViolation {
  ruleId: string;
  ruleCode: string;
  onFail: ValidationOnFail;
  message: string;
  /** Set for fleet per-leg failures. */
  legIndex?: number;
  /** leg | aggregated — fleet aggregated booking-level check */
  scope?: 'leg' | 'aggregated' | 'booking';
  measuredValue?: number;
  thresholdValue?: number;
}

export interface PricingValidationResult {
  ok: boolean;
  violations: PricingValidationViolation[];
  /** True when bespoke or explicit skip. */
  skipped?: boolean;
  skipReason?: 'bespoke' | 'no_active_rules';
}

export interface ValidateOptions {
  /** Injected rules for tests; production will load from DB in a later phase. */
  rules?: PricingValidationRuleRow[];
}

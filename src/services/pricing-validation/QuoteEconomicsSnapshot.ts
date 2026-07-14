import {
  CanonicalVehicleCategoryId,
  PricingValidationBookingType,
  QuoteEconomicsLegInput,
  QuoteEconomicsSnapshotInput,
} from './pricingValidation.types';

/**
 * Normalized economics payload for the validation layer.
 * Built after PricingEngine.calculate — before quote persistence (future hook).
 */
export class QuoteEconomicsSnapshot implements QuoteEconomicsSnapshotInput {
  readonly bookingType: PricingValidationBookingType;
  readonly isFleet: boolean;
  readonly organizationId: string;
  readonly vehicleCategoryId: CanonicalVehicleCategoryId | null;
  readonly clientTotalPence: number;
  readonly clientNetPence: number;
  readonly estimatedDriverPence: number;
  readonly operatorCommissionPence: number;
  readonly platformFeePence: number;
  readonly distanceMiles: number;
  readonly durationMinutes: number;
  readonly legs?: QuoteEconomicsLegInput[];

  constructor(input: QuoteEconomicsSnapshotInput) {
    this.bookingType = input.bookingType;
    this.isFleet = input.isFleet;
    this.organizationId = input.organizationId;
    this.vehicleCategoryId = input.vehicleCategoryId ?? null;
    this.clientTotalPence = input.clientTotalPence;
    this.clientNetPence = input.clientNetPence;
    this.estimatedDriverPence = input.estimatedDriverPence;
    this.operatorCommissionPence = input.operatorCommissionPence;
    this.platformFeePence = input.platformFeePence;
    this.distanceMiles = input.distanceMiles;
    this.durationMinutes = input.durationMinutes;
    this.legs = input.legs;
  }

  static fromInput(input: QuoteEconomicsSnapshotInput): QuoteEconomicsSnapshot {
    return new QuoteEconomicsSnapshot(input);
  }

  /** Bespoke quotes bypass validation entirely (Phase 0 contract). */
  isBespoke(): boolean {
    return this.bookingType === 'bespoke';
  }

  /** Effective leg type for rule matching (fleet legs only). */
  legBookingTypes(): Exclude<PricingValidationBookingType, 'bespoke'>[] {
    if (!this.isFleet || !this.legs?.length) {
      if (this.bookingType === 'bespoke') {
        return [];
      }
      return [this.bookingType as Exclude<PricingValidationBookingType, 'bespoke'>];
    }
    return this.legs.map((l) => l.bookingType);
  }
}

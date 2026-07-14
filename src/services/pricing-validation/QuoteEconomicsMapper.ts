/**
 * QuoteEconomicsMapper — Phase 1C quote-time economics visibility.
 *
 * Builds an immutable economics snapshot after PricingEngine.calculate().
 * Uses accounting-style commission split (FinancialSnapshotService reference),
 * NOT marketplace SQL tier payout.
 *
 * Future: PricingValidationService, monitor mode, profitability dashboards.
 */

import { QuoteAmountsMapper } from '../mappers/quoteAmountsMapper';
import { PartnerRevenueShareService } from '../PartnerRevenueShareService';
import type { OrganizationFinancialSettings } from '../../types/organizationFinancialSettings.types';
import type {
  QuoteEconomicsExtraItem,
  QuoteEconomicsMapperInput,
  QuoteEconomicsSnapshotData,
} from '../../types/quoteEconomics.types';
import { QUOTE_ECONOMICS_SNAPSHOT_VERSION } from '../../types/quoteEconomics.types';
import {
  BookingType,
  NormalizedPricingRequest,
  PricingBreakdownData,
  PricingResult,
} from '../../types/pricing.types';
import type { CanonicalVehicleCategoryId } from './pricingValidation.types';

export interface BuildQuoteEconomicsSnapshotParams {
  pricingResult: PricingResult;
  normalizedRequest: NormalizedPricingRequest;
  organizationId: string;
  organizationSettings: QuoteEconomicsMapperInput['organizationSettings'];
  financialSettings: OrganizationFinancialSettings;
}

interface CommissionSplit {
  platformFeePence: number;
  operatorFeePence: number;
  driverBasePence: number;
}

/** Aligns with FinancialSnapshotService.createBookingFinancial commission math. */
function calculateCommissionSplit(
  subtotalExVatPence: number,
  vehicleNetPence: number,
  platformPct: number,
  operatorPct: number
): CommissionSplit {
  const platformFeePence = Math.round(subtotalExVatPence * platformPct);
  const operatorFeePence = Math.round((subtotalExVatPence - platformFeePence) * operatorPct);

  const platformFeeOnVehicle = Math.round(vehicleNetPence * platformPct);
  const operatorFeeOnVehicle = Math.round((vehicleNetPence - platformFeeOnVehicle) * operatorPct);
  const driverBasePence = vehicleNetPence - platformFeeOnVehicle - operatorFeeOnVehicle;

  return {
    platformFeePence,
    operatorFeePence,
    driverBasePence,
  };
}

function poundsToPence(pounds: number): number {
  return Math.round((pounds || 0) * 100);
}

function vehicleSubtotalPence(breakdown: PricingBreakdownData): number {
  return poundsToPence(
    breakdown.baseFare +
      breakdown.distanceFee +
      breakdown.timeFee +
      breakdown.airportFees +
      breakdown.zoneFees +
      breakdown.tollFees
  );
}

function servicesSubtotalPence(breakdown: PricingBreakdownData): number {
  return poundsToPence(breakdown.serviceItemFees);
}

function resolveOperationalReservePence(
  bookingType: BookingType,
  financialSettings: OrganizationFinancialSettings
): number {
  switch (bookingType) {
    case BookingType.HOURLY:
    case BookingType.FLEET_HOURLY:
      return financialSettings.hourly_operational_reserve_pence;
    case BookingType.DAILY:
    case BookingType.FLEET_DAILY:
      return financialSettings.daily_operational_reserve_pence;
    case BookingType.FLEET:
      return financialSettings.fleet_operational_reserve_pence;
    default:
      return financialSettings.default_operational_reserve_pence;
  }
}

function resolveVehicleCategory(
  request: NormalizedPricingRequest
): CanonicalVehicleCategoryId | string | null {
  const vt = 'vehicleType' in request ? request.vehicleType : undefined;
  if (!vt) return null;
  return vt as CanonicalVehicleCategoryId;
}

function resolveDistanceMiles(pricingResult: PricingResult): number {
  return (
    pricingResult.routeMetrics?.fullDistance ??
    pricingResult.legs?.[0]?.distance_miles ??
    0
  );
}

function resolveDurationMinutes(pricingResult: PricingResult): number {
  const dur = pricingResult.routeMetrics?.fullDuration ?? pricingResult.legs?.[0]?.duration_min;
  return dur != null ? Math.round(dur) : 0;
}

async function buildExtrasEconomics(
  breakdown: PricingBreakdownData,
  extrasIds: string[],
  organizationId: string
): Promise<{ items: QuoteEconomicsExtraItem[]; driverExtrasPayoutPence: number }> {
  const items: QuoteEconomicsExtraItem[] = [];
  let driverExtrasPayoutPence = 0;

  const detailById = new Map<string, number>();
  for (const d of breakdown.details ?? []) {
    if (d.component !== 'service_item') continue;
    const match = d.description?.match(/\(([a-z0-9-]+)\)\s*$/i);
    const id = match?.[1];
    if (id) detailById.set(id, poundsToPence(d.amount));
  }

  for (const serviceItemId of extrasIds) {
    if (serviceItemId === 'multi_stop') continue;

    const clientPricePence =
      detailById.get(serviceItemId) ??
      (await lookupServiceItemPricePence(serviceItemId, organizationId));

    let itemDriverPayout = 0;
    try {
      const { PricingDataService } = await import('../PricingDataService');
      const rules = await PricingDataService.getServiceItemPayoutRules(serviceItemId, organizationId);
      for (const rule of rules) {
        if (rule.recipient_type !== 'driver') continue;
        if (rule.payout_mode === 'fixed') {
          itemDriverPayout += Number(rule.payout_value) || 0;
        } else if (rule.payout_mode === 'percentage') {
          itemDriverPayout += Math.round(clientPricePence * (Number(rule.payout_value) / 10000));
        }
      }
    } catch {
      // Non-critical — extras payout estimate stays 0 for this item
    }

    driverExtrasPayoutPence += itemDriverPayout;
    items.push({
      service_item_id: serviceItemId,
      client_price_pence: clientPricePence,
      estimated_driver_payout_pence: itemDriverPayout,
      estimated_supplier_cost_pence: 0,
    });
  }

  return { items, driverExtrasPayoutPence };
}

async function lookupServiceItemPricePence(
  serviceItemId: string,
  organizationId: string
): Promise<number> {
  try {
    const { PricingDataService } = await import('../PricingDataService');
    const rows = await PricingDataService.getServiceItemsByIds([serviceItemId], organizationId);
    return Number(rows[0]?.price_pence) || 0;
  } catch {
    return 0;
  }
}

export class QuoteEconomicsMapper {
  /**
   * Build immutable quote-time economics snapshot (all pence integers).
   */
  static async buildSnapshot(
    params: BuildQuoteEconomicsSnapshotParams
  ): Promise<QuoteEconomicsSnapshotData> {
    const {
      pricingResult,
      normalizedRequest,
      organizationId,
      organizationSettings,
      financialSettings,
    } = params;

    const breakdown = pricingResult.bookingBreakdown!;
    const vatRateForQuote = organizationSettings.vat_rate;

    const amounts = QuoteAmountsMapper.calculateIndependentQuoteAmounts(pricingResult, vatRateForQuote);

    const subtotalExVatPence = amounts.subtotalPence - amounts.discountPence;
    const clientNetPence = amounts.netPence;
    const vatPence = amounts.vatPence;
    const clientGrossPence = amounts.totalPence;

    const vehicleNet = vehicleSubtotalPence(breakdown);

    const { platformFeePence, operatorFeePence } = calculateCommissionSplit(
      subtotalExVatPence,
      vehicleNet,
      organizationSettings.platform_commission_pct,
      organizationSettings.operator_commission_pct
    );

    const estimatedProcessorFeePence =
      Math.round(clientGrossPence * financialSettings.processor_fee_pct) +
      financialSettings.processor_fixed_fee_pence;

    const operationalReservePence = resolveOperationalReservePence(
      normalizedRequest.bookingType,
      financialSettings
    );

    const extrasIds = normalizedRequest.extras ?? [];
    const { items: extras, driverExtrasPayoutPence } = await buildExtrasEconomics(
      breakdown,
      extrasIds,
      organizationId
    );

    const scheduledAt =
      'dateTime' in normalizedRequest ? normalizedRequest.dateTime : undefined;
    const vehicleCategory = resolveVehicleCategory(normalizedRequest);

    const partnerShare = await PartnerRevenueShareService.calculate({
      organizationId,
      clientNetPence,
      clientGrossPence,
      processorFeePence: estimatedProcessorFeePence,
      platformFeePence: platformFeePence,
      vehicleCategoryId: vehicleCategory != null ? String(vehicleCategory) : null,
      scheduledAt: scheduledAt ?? null,
      bookingType: String(normalizedRequest.bookingType),
      includeCurrentBookingInTierCount: true,
    });

    const estimatedDriverMarketplacePence =
      partnerShare.estimatedDriverMarketplacePence + driverExtrasPayoutPence;
    const estimatedDriverPayoutPence = estimatedDriverMarketplacePence;
    const estimatedSupplierCostPence = 0;

    const retainedGrossPence = Math.max(
      0,
      clientGrossPence - estimatedProcessorFeePence - operationalReservePence
    );

    const retainedNetPence = Math.max(
      0,
      partnerShare.vantageLaneRetainedPence -
        operatorFeePence -
        platformFeePence -
        estimatedSupplierCostPence -
        operationalReservePence
    );

    const estimatedMarginPct =
      clientGrossPence > 0
        ? Math.round((retainedNetPence / clientGrossPence) * 10000)
        : 0;

    const bookingType = normalizedRequest.bookingType;
    const bookingTypeStr = String(bookingType);
    const isFleet =
      bookingTypeStr === BookingType.FLEET ||
      bookingTypeStr === BookingType.FLEET_HOURLY ||
      bookingTypeStr === BookingType.FLEET_DAILY;

    return {
      schema_version: QUOTE_ECONOMICS_SNAPSHOT_VERSION,
      organization_id: organizationId,
      booking_type: bookingType,
      vehicle_category: resolveVehicleCategory(normalizedRequest),
      pricing_version_id: pricingResult.pricing_version_id ?? null,
      generated_at: new Date().toISOString(),

      client_gross_pence: clientGrossPence,
      vat_pence: vatPence,
      client_net_pence: clientNetPence,

      estimated_platform_fee_pence: platformFeePence,
      estimated_operator_payout_pence: operatorFeePence,
      estimated_driver_payout_pence: estimatedDriverPayoutPence,
      estimated_driver_marketplace_payout_pence: estimatedDriverMarketplacePence,
      estimated_driver_tier_factor: partnerShare.driverTierFactor,
      estimated_driver_extras_payout_pence: driverExtrasPayoutPence,
      estimated_supplier_cost_pence: estimatedSupplierCostPence,

      estimated_processor_fee_pence: estimatedProcessorFeePence,
      operational_reserve_pence: operationalReservePence,

      retained_gross_pence: retainedGrossPence,
      retained_net_pence: retainedNetPence,
      contribution_margin_pence: partnerShare.contributionMarginPence,
      estimated_partner_share_pence: partnerShare.partnerSharePence,
      partner_share_rate_bp: partnerShare.partnerShareRateBp,
      partner_tier_booking_count: partnerShare.partnerTierBookingCount,
      partner_share_enabled: partnerShare.isEnabled,
      estimated_vantage_lane_retained_pence: partnerShare.vantageLaneRetainedPence,
      estimated_margin_pct: estimatedMarginPct,

      distance_miles: resolveDistanceMiles(pricingResult),
      duration_minutes: resolveDurationMinutes(pricingResult),
      is_fleet: isFleet,

      extras,

      config_sources: {
        vat_from: 'organization_settings',
        commissions_from: 'organization_settings',
        processor_and_reserve_from: 'organization_financial_settings',
        payout_rules_from: 'service_item_payout_rules',
        partner_share_from: 'partner_revenue_share_tiers',
      },
    };
  }

  /**
   * Map Phase 1C snapshot → Phase 0 validation input (future guardrails / monitor).
   */
  static toValidationInput(snapshot: QuoteEconomicsSnapshotData): import('./pricingValidation.types').QuoteEconomicsSnapshotInput {
    const bookingType =
      snapshot.booking_type === 'fleet' ||
      snapshot.booking_type === 'fleet_hourly' ||
      snapshot.booking_type === 'fleet_daily'
        ? 'oneway'
        : (snapshot.booking_type as import('./pricingValidation.types').PricingValidationBookingType);

    return {
      bookingType,
      isFleet: snapshot.is_fleet,
      organizationId: snapshot.organization_id,
      vehicleCategoryId: (snapshot.vehicle_category as CanonicalVehicleCategoryId) ?? null,
      clientTotalPence: snapshot.client_gross_pence,
      clientNetPence: snapshot.client_net_pence,
      estimatedDriverPence: snapshot.estimated_driver_payout_pence,
      operatorCommissionPence: snapshot.estimated_operator_payout_pence,
      platformFeePence: snapshot.estimated_platform_fee_pence,
      distanceMiles: snapshot.distance_miles,
      durationMinutes: snapshot.duration_minutes,
    };
  }
}

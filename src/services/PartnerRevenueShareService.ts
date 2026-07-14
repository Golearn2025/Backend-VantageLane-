/**
 * Partner revenue share — volume tiers on contribution margin.
 * Separate from operator_commission (PHV umbrella).
 */

import { supabase } from '../config/supabase';
import { DriverMarketplaceEstimateService } from './DriverMarketplaceEstimateService';

export type PartnerShareBasis = 'contribution_margin' | 'client_net' | 'platform_margin';

export interface PartnerShareCalculationInput {
  organizationId: string;
  clientNetPence: number;
  clientGrossPence: number;
  processorFeePence: number;
  platformFeePence: number;
  vehicleCategoryId?: string | null;
  scheduledAt?: string | null;
  bookingType?: string | null;
  /** Include this booking when resolving tier (quote preview). */
  includeCurrentBookingInTierCount?: boolean;
  at?: Date;
}

export interface PartnerShareCalculationResult {
  isEnabled: boolean;
  isPartnerOrg: boolean;
  contributionMarginPence: number;
  shareBasisPence: number;
  estimatedDriverMarketplacePence: number;
  driverTierFactor: number | null;
  partnerSharePence: number;
  partnerShareRateBp: number;
  partnerTierBookingCount: number;
  vantageLaneRetainedPence: number;
}

const QUALIFYING_STATUSES = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

export class PartnerRevenueShareService {
  static async calculate(
    input: PartnerShareCalculationInput
  ): Promise<PartnerShareCalculationResult> {
    const at = input.at ?? new Date();

    const driverEstimate = await DriverMarketplaceEstimateService.estimate({
      organizationId: input.organizationId,
      clientNetPence: input.clientNetPence,
      vehicleCategoryId: input.vehicleCategoryId,
      scheduledAt: input.scheduledAt,
      bookingType: input.bookingType,
    });

    const contributionMarginPence = Math.max(
      0,
      input.clientNetPence -
        driverEstimate.payoutPence -
        input.processorFeePence
    );

    const { data: org } = await supabase
      .from('organizations')
      .select('org_type')
      .eq('id', input.organizationId)
      .maybeSingle();

    const isPartnerOrg = org?.org_type === 'partner';

    const zeroResult = (
      shareBasisPence: number,
      overrides: Partial<PartnerShareCalculationResult> = {}
    ): PartnerShareCalculationResult => ({
      isEnabled: false,
      isPartnerOrg,
      contributionMarginPence,
      shareBasisPence,
      estimatedDriverMarketplacePence: driverEstimate.payoutPence,
      driverTierFactor: driverEstimate.tierFactor,
      partnerSharePence: 0,
      partnerShareRateBp: 0,
      partnerTierBookingCount: 0,
      vantageLaneRetainedPence: shareBasisPence,
      ...overrides,
    });

    if (!isPartnerOrg) {
      return zeroResult(contributionMarginPence);
    }

    const { data: config } = await supabase
      .from('partner_revenue_share_configs')
      .select('is_enabled, share_basis, tier_period')
      .eq('organization_id', input.organizationId)
      .maybeSingle();

    if (!config?.is_enabled) {
      return zeroResult(contributionMarginPence, { isEnabled: false, isPartnerOrg: true });
    }

    const shareBasis = (config.share_basis as PartnerShareBasis) || 'contribution_margin';
    let shareBasisPence = contributionMarginPence;
    if (shareBasis === 'client_net') {
      shareBasisPence = input.clientNetPence;
    } else if (shareBasis === 'platform_margin') {
      shareBasisPence = Math.max(0, input.platformFeePence);
    }

    const periodCount = await this.countPeriodBookings(
      input.organizationId,
      at,
      config.tier_period
    );
    const tierBookingCount =
      periodCount + (input.includeCurrentBookingInTierCount ? 1 : 0);

    const sharePct = await this.resolveSharePct(input.organizationId, tierBookingCount);
    const partnerSharePence = Math.round(shareBasisPence * sharePct);
    const vantageLaneRetainedPence = Math.max(0, shareBasisPence - partnerSharePence);

    return {
      isEnabled: true,
      isPartnerOrg: true,
      contributionMarginPence,
      shareBasisPence,
      estimatedDriverMarketplacePence: driverEstimate.payoutPence,
      driverTierFactor: driverEstimate.tierFactor,
      partnerSharePence,
      partnerShareRateBp: Math.round(sharePct * 10000),
      partnerTierBookingCount: tierBookingCount,
      vantageLaneRetainedPence,
    };
  }

  private static async countPeriodBookings(
    organizationId: string,
    at: Date,
    tierPeriod: string
  ): Promise<number> {
    if (tierPeriod === 'rolling_30d') {
      const since = new Date(at.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .in('status', QUALIFYING_STATUSES)
        .gte('created_at', since)
        .lte('created_at', at.toISOString());
      if (error) return 0;
      return count ?? 0;
    }

    const { data, error } = await supabase.rpc('count_partner_period_bookings', {
      p_organization_id: organizationId,
      p_at: at.toISOString(),
    });
    if (error) {
      console.error('count_partner_period_bookings error:', error);
      return 0;
    }
    return Number(data) || 0;
  }

  private static async resolveSharePct(
    organizationId: string,
    bookingCount: number
  ): Promise<number> {
    const { data: tiers, error } = await supabase
      .from('partner_revenue_share_tiers')
      .select('min_bookings, max_bookings, share_pct, sort_order')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !tiers?.length) return 0;

    const effectiveCount = Math.max(bookingCount, 1);
    const match = tiers.find((t) => {
      const min = Number(t.min_bookings ?? 0);
      const max = t.max_bookings != null ? Number(t.max_bookings) : null;
      return effectiveCount >= min && (max === null || effectiveCount <= max);
    });

    return match ? Number(match.share_pct) : 0;
  }
}

/**
 * Driver marketplace payout estimate — aligns with SQL compute_driver_offer_base_payout_pence.
 * tier % × client trip net, rounded to whole pounds.
 */

import { supabase } from '../config/supabase';

export interface DriverMarketplaceEstimateInput {
  organizationId: string;
  clientNetPence: number;
  vehicleCategoryId?: string | null;
  scheduledAt?: string | null;
  bookingType?: string | null;
}

export interface DriverMarketplaceEstimateResult {
  payoutPence: number;
  tierFactor: number | null;
  tripNetPence: number;
}

function roundPayoutPenceToPound(pence: number): number {
  return Math.round(pence / 100) * 100;
}

function resolveTierGroup(bookingType?: string | null): 'trip' | 'duration' {
  const bt = (bookingType || 'oneway').toLowerCase();
  if (bt === 'hourly' || bt === 'daily' || bt === 'fleet_hourly' || bt === 'fleet_daily') {
    return 'duration';
  }
  return 'trip';
}

function hoursBeforeJob(scheduledAt?: string | null): number {
  const scheduled = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const diffMs = scheduled.getTime() - Date.now();
  return Math.max(diffMs / (1000 * 60 * 60), 0);
}

export class DriverMarketplaceEstimateService {
  static async estimate(
    input: DriverMarketplaceEstimateInput
  ): Promise<DriverMarketplaceEstimateResult> {
    const tripNetPence = Math.max(0, input.clientNetPence);
    const categoryId = (input.vehicleCategoryId || 'executive').trim() || 'executive';
    const tierGroup = resolveTierGroup(input.bookingType);
    const hoursRemaining = hoursBeforeJob(input.scheduledAt);

    const { data: tiers, error } = await supabase
      .from('payout_escalation_tiers')
      .select(
        `
        driver_payout_factor,
        min_hours_before_job,
        max_hours_before_job,
        sort_order,
        pricing_versions!inner (
          id,
          is_active,
          organization_id
        )
      `
      )
      .eq('is_active', true)
      .eq('tier_group', tierGroup)
      .eq('vehicle_category_id', categoryId)
      .eq('pricing_versions.is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !tiers?.length) {
      return { payoutPence: 0, tierFactor: null, tripNetPence };
    }

    const orgId = input.organizationId;
    const matching = tiers.filter((t: any) => {
      const pv = t.pricing_versions;
      const minH = Number(t.min_hours_before_job ?? 0);
      const maxH = t.max_hours_before_job != null ? Number(t.max_hours_before_job) : null;
      const orgMatch = !pv?.organization_id || pv.organization_id === orgId;
      const hoursMatch =
        hoursRemaining >= minH && (maxH === null || hoursRemaining < maxH);
      return orgMatch && hoursMatch;
    });

    const sorted = matching.sort((a: any, b: any) => {
      const aOrg = a.pricing_versions?.organization_id === orgId ? 0 : 1;
      const bOrg = b.pricing_versions?.organization_id === orgId ? 0 : 1;
      if (aOrg !== bOrg) return aOrg - bOrg;
      return Number(a.sort_order) - Number(b.sort_order);
    });

    const tier = sorted[0];
    if (!tier || tripNetPence <= 0) {
      return { payoutPence: 0, tierFactor: null, tripNetPence };
    }

    const factor = Number(tier.driver_payout_factor);
    const raw = Math.round(tripNetPence * factor);
    const payoutPence = roundPayoutPenceToPound(raw);

    return { payoutPence, tierFactor: factor, tripNetPence };
  }
}

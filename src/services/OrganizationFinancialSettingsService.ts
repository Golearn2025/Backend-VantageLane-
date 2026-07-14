/**
 * Organization Financial Settings Service (Phase 1B)
 *
 * Fetches tenant economics configuration from organization_financial_settings.
 * Admin UI: Prices → Financial Settings tab (ADMIN-2026 /api/admin/organization-financial-settings).
 *
 * --- FUTURE INTEGRATION POINTS (not wired yet) ---
 * - QuoteEconomicsMapper: map quote totals → economics snapshot using VAT, processor fees, reserves
 * - PricingValidationService: enforce low_margin_warning_pct / minimum_profit_pence guardrails
 * - Monitor mode: read-only economics preview alongside live quote flow
 * - calculate-and-quote / pricing engine: replace hardcoded assumptions with org config
 */

import { supabase } from '../config/supabase';
import type { OrganizationFinancialSettings } from '../types/organizationFinancialSettings.types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SettingsCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly TTL_MS = 60 * 1000;

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

const cache = new SettingsCache();

export class OrganizationFinancialSettingsService {
  static async getOrganizationFinancialSettings(
    organizationId?: string
  ): Promise<OrganizationFinancialSettings> {
    const orgId = organizationId || (await this.getDefaultOrganizationId());
    const cacheKey = `org_financial_settings:${orgId}`;

    const cached = cache.get<OrganizationFinancialSettings>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('organization_financial_settings')
      .select(
        'organization_id, vat_rate, vat_enabled, processor_fee_pct, processor_fixed_fee_pence, default_operational_reserve_pence, hourly_operational_reserve_pence, daily_operational_reserve_pence, fleet_operational_reserve_pence, low_margin_warning_pct, minimum_profit_pence'
      )
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching organization financial settings:', error);
      return this.getDefaultSettings(orgId);
    }

    if (!data) {
      return this.getDefaultSettings(orgId);
    }

    const settings = this.mapRow(data, orgId);
    cache.set(cacheKey, settings);
    return settings;
  }

  static invalidateCache(organizationId?: string): void {
    if (organizationId) {
      cache.invalidate(`org_financial_settings:${organizationId}`);
    } else {
      cache.invalidate();
    }
    console.log('✅ Organization financial settings cache invalidated');
  }

  private static mapRow(
    data: Record<string, unknown>,
    fallbackOrgId: string
  ): OrganizationFinancialSettings {
    return {
      organization_id: String(data.organization_id ?? fallbackOrgId),
      vat_rate: Number(data.vat_rate ?? 0.20),
      vat_enabled: data.vat_enabled !== false,
      processor_fee_pct: Number(data.processor_fee_pct ?? 0.014),
      processor_fixed_fee_pence: Number(data.processor_fixed_fee_pence ?? 20),
      default_operational_reserve_pence: Number(data.default_operational_reserve_pence ?? 0),
      hourly_operational_reserve_pence: Number(data.hourly_operational_reserve_pence ?? 0),
      daily_operational_reserve_pence: Number(data.daily_operational_reserve_pence ?? 0),
      fleet_operational_reserve_pence: Number(data.fleet_operational_reserve_pence ?? 0),
      low_margin_warning_pct: Number(data.low_margin_warning_pct ?? 0.10),
      minimum_profit_pence: Number(data.minimum_profit_pence ?? 0),
    };
  }

  private static async getDefaultOrganizationId(): Promise<string> {
    const cacheKey = 'default_org_id';
    const cached = cache.get<string>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      console.warn('No active organization found, using fallback');
      return 'default-org-id';
    }

    cache.set(cacheKey, data.id);
    return data.id;
  }

  /** UK-centric defaults when no DB row exists. */
  private static getDefaultSettings(organizationId: string): OrganizationFinancialSettings {
    return {
      organization_id: organizationId,
      vat_rate: 0.20,
      vat_enabled: true,
      processor_fee_pct: 0.014,
      processor_fixed_fee_pence: 20,
      default_operational_reserve_pence: 0,
      hourly_operational_reserve_pence: 0,
      daily_operational_reserve_pence: 0,
      fleet_operational_reserve_pence: 0,
      low_margin_warning_pct: 0.10,
      minimum_profit_pence: 0,
    };
  }
}

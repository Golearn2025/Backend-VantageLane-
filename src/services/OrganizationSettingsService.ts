/**
 * Organization Settings Service
 * 
 * Fetches organization-specific settings from Supabase (organization_settings).
 * Admin UI: Prices → VAT & Commission tab (ADMIN-2026 /api/admin/organization-settings).
 * - platform_commission_pct, operator_commission_pct, vat_rate (decimals, e.g. 0.20 = 20%)
 */

import { supabase } from '../config/supabase';

interface OrganizationSettings {
  organization_id: string;
  platform_commission_pct: number;
  operator_commission_pct: number;
  vat_rate: number;
  currency: string;
  timezone: string;
}

// In-memory cache
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SettingsCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly TTL_MS = 60 * 1000; // 1 minute — Admin can update VAT/commission frequently

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.TTL_MS) {
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

export class OrganizationSettingsService {
  
  /**
   * Get organization settings by ID
   * Falls back to default organization if not specified
   */
  static async getOrganizationSettings(organizationId?: string): Promise<OrganizationSettings> {
    const orgId = organizationId || await this.getDefaultOrganizationId();
    const cacheKey = `org_settings:${orgId}`;
    
    const cached = cache.get<OrganizationSettings>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (error) {
      console.error('Error fetching organization settings:', error);
      // Return defaults if settings not found
      return this.getDefaultSettings(orgId);
    }

    if (!data) {
      return this.getDefaultSettings(orgId);
    }

    const settings: OrganizationSettings = {
      organization_id: data.organization_id,
      platform_commission_pct: data.platform_commission_pct || 0.10,
      operator_commission_pct: data.operator_commission_pct || 0.10,
      vat_rate: data.vat_rate || 0.20, // UK VAT default
      currency: data.currency || 'GBP',
      timezone: data.timezone || 'Europe/London'
    };

    cache.set(cacheKey, settings);
    return settings;
  }

  /**
   * Get platform commission percentage
   */
  static async getPlatformCommission(organizationId?: string): Promise<number> {
    const settings = await this.getOrganizationSettings(organizationId);
    return settings.platform_commission_pct;
  }

  /**
   * Get operator commission percentage
   */
  static async getOperatorCommission(organizationId?: string): Promise<number> {
    const settings = await this.getOrganizationSettings(organizationId);
    return settings.operator_commission_pct;
  }

  /**
   * Get VAT rate
   */
  static async getVATRate(organizationId?: string): Promise<number> {
    const settings = await this.getOrganizationSettings(organizationId);
    return settings.vat_rate;
  }

  /**
   * Get default organization ID
   * In multi-tenant setup, this would come from request context
   * For now, fetch the first active organization
   */
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

  /**
   * Get default settings (fallback)
   */
  private static getDefaultSettings(organizationId: string): OrganizationSettings {
    return {
      organization_id: organizationId,
      platform_commission_pct: 0.10, // 10%
      operator_commission_pct: 0.10, // 10%
      vat_rate: 0.20, // 20% UK VAT
      currency: 'GBP',
      timezone: 'Europe/London'
    };
  }

  /**
   * Invalidate cache
   */
  static invalidateCache(organizationId?: string): void {
    if (organizationId) {
      cache.invalidate(`org_settings:${organizationId}`);
    } else {
      cache.invalidate();
    }
    console.log('✅ Organization settings cache invalidated');
  }
}

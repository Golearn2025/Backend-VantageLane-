/**
 * Pricing Data Service
 *
 * Reads pricing data from normalized database VIEWS
 * Replaces old PricingConfigService that read from pricing_config JSONB
 *
 * Views used:
 * - v_active_pricing_version
 * - v_pricing_vehicle_rates
 * - v_pricing_hourly_rules
 * - v_pricing_daily_rules
 * - v_pricing_time_rules
 * - v_pricing_airport_fees
 * - v_pricing_zone_fees
 * - v_pricing_rounding_rules
 */

import { supabase } from '../config/supabase';

// Cache structure
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// In-memory cache with 5-minute TTL
class DataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly TTL_MS = 30 * 1000; // 30 seconds

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

  getStatus() {
    return {
      entries: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

const cache = new DataCache();

export class PricingDataService {

  /**
   * Get active pricing version.
   *
   * Uses maybeSingle() so that:
   *   - 0 rows → data is null  → clear "no active version" error
   *   - 2+ rows → Supabase PGRST116 error → clear "multiple active versions" error
   * The DB-level unique partial index (only_one_active_pricing_version) is the
   * primary guard; this method is the last-resort code guard.
   */
  static async getActivePricingVersion(organizationId?: string): Promise<any> {
    // Multi-tenant: each organization has its own active pricing version
    // (e.g. Vantage Lane runs "v2", a partner venue runs its own version).
    // Scope the lookup to a single org so the global query never returns 2+
    // active rows (which would make maybeSingle() throw PGRST116). When no org
    // is supplied we fall back to the Vantage Lane org, preserving the previous
    // behaviour for callers that only need global settings.
    const orgId =
      organizationId ||
      process.env.DEFAULT_ORGANIZATION_ID ||
      '9a5caade-4791-4860-93b5-12b1c4fa9830';

    const cacheKey = `active_version:${orgId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('pricing_versions')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching active pricing version:', error);
      if (error.code === 'PGRST116') {
        throw new Error(
          `Multiple active pricing versions detected for organization ${orgId}. ` +
          'Exactly one pricing version must be active per organization. ' +
          'Deactivate the duplicates in the Admin → Pricing → Versions panel.'
        );
      }
      throw new Error(`Failed to fetch active pricing version: ${error.message}`);
    }

    if (!data) {
      throw new Error(
        `No active pricing version found for organization ${orgId}. Pricing cannot be calculated. ` +
        'Go to Admin → Pricing → Versions and activate a version.'
      );
    }

    cache.set(cacheKey, data);
    return data;
  }

  /**
   * Get vehicle rates for specific vehicle type and booking type
   *
   * @param vehicleCategory - executive, luxury, suv, van
   * @param bookingType - one_way, return, hourly, daily, fleet
   */
  /**
   * Map API/bookingType to v_pricing_vehicle_rates.booking_type column.
   * Preserves fleet_hourly / fleet_daily; return legs use oneway rates.
   */
  static normalizeBookingTypeForVehicleRates(bookingType: string): string {
    const bt = String(bookingType).toLowerCase();
    if (bt === 'one_way' || bt === 'oneway') return 'oneway';
    if (bt === 'return') return 'oneway';
    if (bt === 'fleet_hourly') return 'fleet_hourly';
    if (bt === 'fleet_daily') return 'fleet_daily';
    if (bt === 'fleet') return 'fleet';
    if (bt === 'hourly') return 'hourly';
    if (bt === 'daily') return 'daily';
    return bt.replace(/_/g, '');
  }

  static async getVehicleRates(vehicleCategory: string, bookingType: string, organizationId?: string): Promise<any> {
    const normalizedBookingType = this.normalizeBookingTypeForVehicleRates(bookingType);

    const cacheKey = `vehicle_rates:${vehicleCategory}:${normalizedBookingType}:${organizationId || 'default'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let query = supabase
      .from('v_pricing_vehicle_rates')
      .select('*')
      .eq('vehicle_category_id', vehicleCategory)
      .eq('booking_type', normalizedBookingType)
      .eq('active', true);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error(`Error fetching vehicle rates for ${vehicleCategory} ${bookingType}:`, error);
      throw new Error(`Failed to fetch vehicle rates: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No vehicle rates found for ${vehicleCategory} ${bookingType}`);
    }

    const result = data;

    cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get hourly rules for specific vehicle category
   */
  static async getHourlyRules(vehicleCategory: string, organizationId?: string): Promise<any> {
    const cacheKey = `hourly_rules:${vehicleCategory}:${organizationId || 'default'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let query = supabase
      .from('v_pricing_hourly_rules')
      .select('*')
      .eq('vehicle_category_id', vehicleCategory)
      .eq('active', true);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error(`Error fetching hourly rules for ${vehicleCategory}:`, error);
      throw new Error(`Failed to fetch hourly rules: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No hourly rules found for ${vehicleCategory}`);
    }

    const result = data;

    cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get daily rules for specific vehicle category
   */
  static async getDailyRules(vehicleCategory: string, organizationId?: string): Promise<any> {
    const cacheKey = `daily_rules:${vehicleCategory}:${organizationId || 'default'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let query = supabase
      .from('v_pricing_daily_rules')
      .select('*')
      .eq('vehicle_category_id', vehicleCategory)
      .eq('active', true);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error(`Error fetching daily rules for ${vehicleCategory}:`, error);
      throw new Error(`Failed to fetch daily rules: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No daily rules found for ${vehicleCategory}`);
    }

    const result = data;

    cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get all time rules (multipliers for different time periods)
   */
  static async getTimeRules(): Promise<any[]> {
    const cacheKey = 'time_rules';
    const cached = cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('v_pricing_time_rules')
      .select('*');

    if (error) {
      console.error('Error fetching time rules:', error);
      throw new Error(`Failed to fetch time rules: ${error.message}`);
    }

    cache.set(cacheKey, data || []);
    return data || [];
  }

  /**
   * Get time rule for specific period
   */
  static async getTimeRule(timePeriod: string): Promise<any> {
    const rules = await this.getTimeRules();
    const rule = rules.find(r => r.time_period === timePeriod);

    if (!rule) {
      throw new Error(`No time rule found for period: ${timePeriod}`);
    }

    return rule;
  }

  /**
   * Get airport fee for specific airport code
   */
  static async getAirportFee(airportCode: string): Promise<any | null> {
    const cacheKey = `airport_fee:${airportCode}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('v_pricing_airport_fees')
      .select('*')
      .eq('airport_code', airportCode.toUpperCase())
      .single();

    if (error) {
      console.error(`Error fetching airport fee for ${airportCode}:`, error);
      return null; // Airport not found is not a critical error
    }

    cache.set(cacheKey, data);
    return data;
  }

  /**
   * Get zone fee for specific zone code
   */
  static async getZoneFee(zoneCode: string): Promise<any | null> {
    const cacheKey = `zone_fee:${zoneCode}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('v_pricing_zone_fees')
      .select('*')
      .eq('zone_code', zoneCode)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error(`Error fetching zone fee for ${zoneCode}:`, error);
      throw new Error(`Failed to fetch zone fee: ${error.message}`);
    }

    cache.set(cacheKey, data);
    return data;
  }

  /**
   * Get rounding rules
   */
  static async getRoundingRules(): Promise<any> {
    // Return default rounding rules (view doesn't exist in current schema)
    return {
      round_to: 0.5,
      round_direction: 'up'
    };
  }

  /**
   * Get return trip settings (discount from pricing_return_rules)
   */
  static async getReturnSettings(organizationId?: string): Promise<{
    discount_rate: number;
    minimum_hours_between: number;
  }> {
    const cacheKey = `return_settings:${organizationId || 'default'}`;
    const cached = cache.get<{ discount_rate: number; minimum_hours_between: number }>(cacheKey);
    if (cached) return cached;

    const policy = await this.getReturnDiscountPolicy('', organizationId);
    const settings = {
      discount_rate: policy ? policy.discount_percentage / 100 : 0,
      minimum_hours_between: 2,
    };

    cache.set(cacheKey, settings);
    return settings;
  }

  /**
   * Get fleet discount settings
   */
  static async getFleetSettings(): Promise<any> {
    const cacheKey = 'fleet_settings';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // Assuming fleet settings are in the version view
    const version = await this.getActivePricingVersion();

    const settings = {
      discounts: {
        tier1: {
          min_vehicles: version.fleet_tier1_min || 3,
          discount_rate: version.fleet_tier1_discount || 0.05
        },
        tier2: {
          min_vehicles: version.fleet_tier2_min || 5,
          discount_rate: version.fleet_tier2_discount || 0.10
        }
      }
    };

    cache.set(cacheKey, settings);
    return settings;
  }

  /**
   * Get service policies (multi-stop fee, minimums, etc.)
   */
  static async getServicePolicies(): Promise<any> {
    const cacheKey = 'service_policies';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const version = await this.getActivePricingVersion();

    const policies = {
      multiStop: version.multi_stop_fee_pence ? version.multi_stop_fee_pence / 100 : 15,
      minimums: {
        distance: version.minimum_distance_miles || 0,
        time: version.minimum_time_minutes || 0
      }
    };

    cache.set(cacheKey, policies);
    return policies;
  }

  /**
   * Get corporate discount settings
   */
  static async getCorporateDiscounts(): Promise<any> {
    const cacheKey = 'corporate_discounts';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const version = await this.getActivePricingVersion();

    const discounts = {
      tier1: version.corporate_tier1_discount || 0.10,
      tier2: version.corporate_tier2_discount || 0.15
    };

    cache.set(cacheKey, discounts);
    return discounts;
  }

  /**
   * Get grace threshold configuration for dual quote stop pricing
   * Returns threshold values from active pricing version
   * 
   * @returns Grace threshold in miles and minutes
   */
  static async getStopGraceThreshold(): Promise<{
    miles: number;
    minutes: number;
  }> {
    const cacheKey = 'stop_grace_threshold';
    const cached = cache.get<{ miles: number; minutes: number }>(cacheKey);
    if (cached) return cached;

    const version = await this.getActivePricingVersion();

    const threshold = {
      miles: version.stop_grace_threshold_miles || 0.5,      // Default: 0.5 miles
      minutes: version.stop_grace_threshold_minutes || 5     // Default: 5 minutes
    };

    cache.set(cacheKey, threshold);
    return threshold;
  }

  /**
   * Check if dual quote stop logic is enabled
   * Priority: ENV override (emergency kill switch) > DB config (business intent)
   * 
   * @returns true if dual quote logic should be used, false for legacy flat fee
   */
  static async isDualQuoteStopLogicEnabled(): Promise<boolean> {
    // 1. Check env override (emergency kill switch) - HIGHEST PRIORITY
    const envOverride = process.env.DISABLE_DUAL_QUOTE_STOP_LOGIC;
    if (envOverride === 'true') {
      console.warn('⚠️ Dual quote stop logic DISABLED by env override (DISABLE_DUAL_QUOTE_STOP_LOGIC=true)');
      return false;
    }

    // 2. Check DB config (business intent)
    const version = await this.getActivePricingVersion();
    const enabled = version.enable_dual_quote_stop_logic || false;

    if (enabled) {
      console.log('✅ Dual quote stop logic ENABLED by pricing version config');
    } else {
      console.log('ℹ️ Dual quote stop logic DISABLED - using legacy flat fee');
    }

    return enabled;
  }

  /**
   * Invalidate cache
   */
  static invalidateCache(key?: string): void {
    cache.invalidate(key);
    console.log('✅ Pricing data cache invalidated', key ? `(key: ${key})` : '(all)');
  }

  /**
   * Get cache status
   */
  static getCacheStatus() {
    return cache.getStatus();
  }

  /**
   * Get all active service items
   * Reads from: service_items table
   */
  static async getServiceItems(organizationId?: string): Promise<any[]> {
    // Note: organizationId parameter kept for backward compatibility but not used
    // service_items table is global without organization_id column
    const cacheKey = `service_items:all`;
    const cached = cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const query = supabase
      .from('service_items')
      .select('*')
      .eq('is_active', true);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching service items:', error);
      throw new Error(`Failed to fetch service items: ${error.message}`);
    }

    cache.set(cacheKey, data || []);
    return data || [];
  }

  /**
   * Get specific service items by IDs
   * Reads from: service_items table
   */
  static async getServiceItemsByIds(serviceIds: string[], organizationId?: string): Promise<any[]> {
    if (!serviceIds || serviceIds.length === 0) {
      return [];
    }

    // Note: organizationId parameter kept for backward compatibility but not used
    // service_items table is global without organization_id column
    const cacheKey = `service_items:${serviceIds.sort().join(',')}`;
    const cached = cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const query = supabase
      .from('service_items')
      .select('*')
      .in('id', serviceIds)
      .eq('is_active', true);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching service items by IDs:', error);
      throw new Error(`Failed to fetch service items: ${error.message}`);
    }

    cache.set(cacheKey, data || []);
    return data || [];
  }

  /**
   * Get service item payout rules
   * Reads from: service_item_payout_rules table
   */
  static async getServiceItemPayoutRules(serviceItemId: string, organizationId?: string): Promise<any[]> {
    const cacheKey = `service_payout_rules:${serviceItemId}:${organizationId || 'default'}`;
    const cached = cache.get<any[]>(cacheKey);
    if (cached) return cached;

    let query = supabase
      .from('service_item_payout_rules')
      .select('*')
      .eq('service_item_id', serviceItemId)
      .eq('is_active', true);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching payout rules for ${serviceItemId}:`, error);
      return []; // Non-critical, return empty
    }

    cache.set(cacheKey, data || []);
    return data || [];
  }

  /**
   * Get current pricing version ID
   */
  static async getCurrentPricingVersionId(): Promise<string> {
    const version = await this.getActivePricingVersion();
    return version.id;
  }

  /**
   * Get driver pricing configuration from specific pricing version
   * Returns factor and guardrails (min/max payout)
   * Used by financial snapshot creation to calculate driver target payout
   * Returns null if pricing version not found (triggers fallback to old calculation)
   */
  static async getDriverPricingConfig(pricingVersionId: string): Promise<{
    factor: number;
    minPayoutPence: number | null;
    maxPayoutPence: number | null;
  } | null> {
    const cacheKey = `driver_pricing_config:${pricingVersionId}`;
    const cached = cache.get<{ factor: number; minPayoutPence: number | null; maxPayoutPence: number | null }>(cacheKey);
    if (cached !== null) return cached;

    const { data, error } = await supabase
      .from('pricing_versions')
      .select('driver_pricing_factor, driver_min_payout_pence, driver_max_payout_pence')
      .eq('id', pricingVersionId)
      .single();

    if (error) {
      console.error(`Error fetching driver pricing config for version ${pricingVersionId}:`, error);
      return null; // Trigger fallback to old calculation
    }

    if (!data || data.driver_pricing_factor === null) {
      console.warn(`No driver pricing config found for version ${pricingVersionId}`);
      return null; // Trigger fallback to old calculation
    }

    const config = {
      factor: data.driver_pricing_factor,
      minPayoutPence: data.driver_min_payout_pence,
      maxPayoutPence: data.driver_max_payout_pence
    };

    cache.set(cacheKey, config);
    return config;
  }

  /**
   * Get multi-stop policy
   * Returns fee per additional stop
   */
  static async getMultiStopPolicy(vehicleType: string, organizationId?: string): Promise<{ fee_per_stop_pence: number }> {
    // Multi-stop fee is typically flat rate, not vehicle-specific
    // Default: £15 per stop (1500 pence)
    return {
      fee_per_stop_pence: 1500
    };
  }

  /**
   * Get return discount policy from pricing_return_rules.
   * Returns null when inactive, missing, or discount_percent is 0.
   */
  static async getReturnDiscountPolicy(
    _vehicleType: string,
    organizationId?: string
  ): Promise<{ discount_percentage: number } | null> {
    let orgId = organizationId;
    if (!orgId) {
      const version = await this.getActivePricingVersion();
      orgId = version?.organization_id;
    }

    const cacheKey = `return_discount:${orgId || 'default'}`;
    const cached = cache.get<{ discount_percentage: number } | 'none'>(cacheKey);
    if (cached === 'none') return null;
    if (cached) return cached;

    if (!orgId) {
      console.warn('getReturnDiscountPolicy: no organization_id — skipping return discount');
      cache.set(cacheKey, 'none');
      return null;
    }

    const { data, error } = await supabase
      .from('pricing_return_rules')
      .select('discount_percent, active')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching return discount policy:', error);
      return null;
    }

    if (!data?.active) {
      cache.set(cacheKey, 'none');
      return null;
    }

    const discountPercent = parseFloat(String(data.discount_percent ?? 0));
    if (!Number.isFinite(discountPercent) || discountPercent <= 0) {
      cache.set(cacheKey, 'none');
      return null;
    }

    const policy = { discount_percentage: discountPercent };
    cache.set(cacheKey, policy);
    return policy;
  }

  /**
   * Get fleet discounts
   * Reads from: pricing_fleet_discounts
   * Returns array of fleet discount tiers (e.g., 5% for 3+ vehicles, 10% for 5+ vehicles)
   */
  static async getFleetDiscounts(organizationId?: string): Promise<Array<{ min_vehicles: number; discount_percent: number }>> {
    const cacheKey = `fleet_discounts:${organizationId || 'default'}`;
    const cached = cache.get<Array<{ min_vehicles: number; discount_percent: number }>>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('pricing_fleet_discounts')
      .select('min_vehicles, discount_percent')
      .eq('active', true)
      .order('min_vehicles', { ascending: true });

    if (error) {
      console.error('Error fetching fleet discounts:', error);
      return [];
    }

    const discounts = data.map(d => ({
      min_vehicles: d.min_vehicles,
      discount_percent: parseFloat(d.discount_percent)
    }));

    cache.set(cacheKey, discounts);
    return discounts;
  }

  /**
   * Convert pence to pounds
   */
  static penceToPounds(pence: number): number {
    return pence / 100;
  }

  /**
   * Convert pounds to pence
   */
  static poundsToPence(pounds: number): number {
    return Math.round(pounds * 100);
  }
}

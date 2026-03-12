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
import { VehicleType, BookingType } from '../types/pricing.types';

// Cache structure
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// In-memory cache with 5-minute TTL
class DataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

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
   * Get active pricing version
   */
  static async getActivePricingVersion(): Promise<any> {
    const cacheKey = 'active_version';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('v_active_pricing_version')
      .select('*')
      .single();

    if (error) {
      console.error('Error fetching active pricing version:', error);
      throw new Error(`Failed to fetch active pricing version: ${error.message}`);
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
  static async getVehicleRates(vehicleCategory: string, bookingType: string, organizationId?: string): Promise<any> {
    // Normalize booking type: one_way -> oneway
    const normalizedBookingType = bookingType.replace('_', '');
    
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
   * Get return trip settings
   * Note: This might be in a separate view or part of version settings
   */
  static async getReturnSettings(): Promise<any> {
    const cacheKey = 'return_settings';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // Assuming return settings are in the version view
    const version = await this.getActivePricingVersion();
    
    const settings = {
      discount_rate: version.return_discount_rate || 0.10,
      minimum_hours_between: version.return_minimum_hours || 2
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

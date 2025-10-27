/**
 * Pricing Configuration Service
 * Fetches pricing config from Supabase with in-memory caching
 */

import { supabase } from '../config/supabase';

// Database types
export interface PricingConfigRow {
  id: string;
  config_version: number;
  is_active: boolean;
  vehicle_types: any;
  time_multipliers: any;
  event_multipliers: any;
  airport_fees: any;
  zone_fees: any;
  premium_services: any;
  service_policies: any;
  general_policies: any;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

// In-memory cache
let cachedConfig: PricingConfigRow | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = (parseInt(process.env.PRICING_CACHE_TTL_SECONDS || '300')) * 1000; // Default 5 minutes

export class PricingConfigService {
  
  /**
   * Get active pricing configuration
   * Uses in-memory cache with TTL
   */
  static async getActivePricingConfig(): Promise<PricingConfigRow> {
    const now = Date.now();
    
    // Return cached config if still valid
    if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL_MS) {
      console.log('✅ Returning cached pricing config');
      return cachedConfig;
    }
    
    console.log('🔄 Fetching fresh pricing config from Supabase...');
    
    try {
      const { data, error } = await supabase
        .from('pricing_config')
        .select('*')
        .eq('is_active', true)
        .single();
      
      if (error) {
        console.error('❌ Error fetching pricing config:', error);
        
        // If we have stale cache, return it as fallback
        if (cachedConfig) {
          console.warn('⚠️ Using stale cache as fallback');
          return cachedConfig;
        }
        
        throw new Error(`Failed to fetch pricing config: ${error.message}`);
      }
      
      if (!data) {
        throw new Error('No active pricing configuration found in database');
      }
      
      // Update cache
      cachedConfig = data as PricingConfigRow;
      cacheTimestamp = now;
      
      console.log(`✅ Pricing config loaded (version ${data.config_version})`);
      return cachedConfig;
      
    } catch (error) {
      console.error('❌ Fatal error in getActivePricingConfig:', error);
      
      // Last resort: return stale cache if available
      if (cachedConfig) {
        console.warn('⚠️ Using stale cache due to fatal error');
        return cachedConfig;
      }
      
      throw error;
    }
  }
  
  /**
   * Invalidate cache (force refresh on next request)
   * Called from Admin API when pricing is updated
   */
  static invalidateCache(): void {
    cachedConfig = null;
    cacheTimestamp = 0;
    console.log('🗑️ Pricing config cache invalidated');
  }
  
  /**
   * Get cache status (for monitoring/debugging)
   */
  static getCacheStatus(): {
    isCached: boolean;
    age: number;
    ttl: number;
    version: number | null;
  } {
    const now = Date.now();
    const age = cachedConfig ? now - cacheTimestamp : 0;
    
    return {
      isCached: cachedConfig !== null,
      age: Math.floor(age / 1000), // seconds
      ttl: Math.floor(CACHE_TTL_MS / 1000), // seconds
      version: cachedConfig?.config_version || null,
    };
  }
}

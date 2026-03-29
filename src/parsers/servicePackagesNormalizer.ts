/**
 * Service Packages Normalizer
 * 
 * Central function to convert servicePackages object to extras array
 * Prevents code duplication across all parsers
 */

import { PricingRequestData } from '../types/pricing.types';

export interface NormalizedServiceData {
  extras: string[];
  tripPreferences?: {
    music?: string;
    temperature?: string;
    communication?: string;
  };
}

/**
 * Normalize servicePackages to extras array
 * 
 * IMPORTANT: tripPreferences are NOT included in extras array
 * They are kept separate for driver visibility
 * 
 * @param request - PricingRequestData with servicePackages or extras
 * @returns Normalized extras array and tripPreferences object
 */
export function normalizeServicePackagesToExtras(request: PricingRequestData): NormalizedServiceData {
  // If servicePackages is provided, convert to extras
  if (request.servicePackages) {
    const extras: string[] = [
      // Included services (always free)
      ...(request.servicePackages.includedServices || []),
      // Premium features (conditional free for Luxury/SUV/MPV)
      ...(request.servicePackages.premiumFeatures || []),
      // Paid upgrades (charged services)
      ...(request.servicePackages.paidUpgrades || [])
    ];

    return {
      extras,
      tripPreferences: request.servicePackages.tripPreferences
    };
  }

  // Fallback to legacy extras array (backwards compatibility)
  return {
    extras: request.extras || [],
    tripPreferences: undefined
  };
}

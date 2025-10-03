/**
 * Centralized pricing configuration in TypeScript
 * Type-safe, modular configuration
 */

import { VehicleType, TimePeriod, PricingConfig } from '../types/pricing.types';

export const PRICING_CONFIG: PricingConfig = {
  vehicles: {
    [VehicleType.EXECUTIVE]: {
      name: 'Executive (E-Class)',
      rates: {
        base: 70, // Aligned with Gerrard's £62 + margin
        perMile: [2.8, 2.2], // Competitive with Gerrard's £2.20
        perMin: 0.45, // Based on report's £0.45/min
        hourly: [85, 90], // Match Gerrard's £85 + small out-of-town margin
        minimum: 90 // Premium to report's £60
      }
    },
    [VehicleType.LUXURY]: {
      name: 'Luxury (S-Class)',
      rates: {
        base: 95, // Aligned with Gerrard's £85 + margin
        perMile: [3.5, 2.8], // Premium to Gerrard's £2.75
        perMin: 0.60, // Premium to report's £0.45
        hourly: [115, 125], // Match Gerrard's £115 + moderate margin
        minimum: 120 // Match report's £120
      }
    },
    [VehicleType.SUV]: {
      name: 'SUV (Range Rover)',
      rates: {
        base: 140, // Competitive with Gerrard's £137.50
        perMile: [4.2, 3.5], // Premium positioning
        perMin: 0.75, // Premium rate
        hourly: [150, 160], // Match Gerrard's £150 + small margin
        minimum: 150 // Premium to market
      }
    },
    [VehicleType.VAN]: {
      name: 'Van/MPV (V-Class)',
      rates: {
        base: 100, // Competitive with Gerrard's £90
        perMile: [3.2, 2.8], // Match report's £2.80
        perMin: 0.55, // Match report's £0.55/min
        hourly: [120, 130], // Match Gerrard's £120 + small margin
        minimum: 100 // Match report's £100
      }
    }
  },

  multipliers: {
    time: {
      [TimePeriod.DAY]: 1.0,
      [TimePeriod.NIGHT]: 1.3,
      [TimePeriod.PEAK_MORNING]: 1.2,
      [TimePeriod.PEAK_EVENING]: 1.2,
      [TimePeriod.WEEKEND]: 1.15
    },
    events: {
      christmas: 1.5,
      newYear: 1.5,
      wimbledon: 1.25,
      default: 1.0
    }
  },

  zones: {
    airports: {
      LHR: { fee: 5.0, wait: 45 },
      LGW: { fee: 5.0, wait: 45 },
      STN: { fee: 7.0, wait: 45 },
      LTN: { fee: 6.0, wait: 45 },
      LCY: { fee: 4.0, wait: 30 }
    },
    congestion: {
      central: 15.0,
      ulez: 12.5,
      lez: 7.5
    },
    tolls: {
      dartford: 2.5,
      m6: 6.7
    }
  },

  services: {
    multiStop: 15.0,
    waitingRate: 12.5,
    freeWaiting: { normal: 15, airport: 45 },
    minimums: { distance: 3.0, time: 10 } // 3 miles minimum (was 5km)
  },

  policies: {
    rounding: { to: 5, direction: 'up' },
    cancellation: { freeHours: 2, chargeRate: 1.0 },
    corporate: { tier1: 0.1, tier2: 0.15 }
  }
};

// Time configuration for dynamic detection
export const TIME_CONFIG = {
  peakMorning: { start: '07:00', end: '09:00', days: [1,2,3,4,5] },
  peakEvening: { start: '17:00', end: '19:00', days: [1,2,3,4,5] },
  night: { start: '22:00', end: '06:00', days: [0,1,2,3,4,5,6] },
  weekend: { days: [0,6] }
};

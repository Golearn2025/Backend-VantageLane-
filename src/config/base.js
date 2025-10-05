/**
 * Centralized Configuration for Vantage Lane Pricing System
 * Modular, scalable configuration without hardcoding
 */

const VEHICLE_TYPES = {
  EXECUTIVE: 'executive',
  LUXURY: 'luxury', 
  SUV: 'suv',
  VAN: 'van'
};

const BOOKING_TYPES = {
  ONE_WAY: 'one_way',
  RETURN: 'return',
  HOURLY: 'hourly',
  FLEET: 'fleet'
};

const TIME_PERIODS = {
  DAY: 'day',
  NIGHT: 'night',
  PEAK_MORNING: 'peak_morning',
  PEAK_EVENING: 'peak_evening',
  WEEKEND: 'weekend'
};

// Dynamic pricing configuration - easy to modify without code changes
const PRICING_CONFIG = {
  vehicles: {
    [VEHICLE_TYPES.EXECUTIVE]: {
      name: 'Executive (E-Class)',
      rates: { base: 60, perKm: [2.5, 2.0], perMin: 0.75, hourly: [55, 70], minimum: 65 }
    },
    [VEHICLE_TYPES.LUXURY]: {
      name: 'Luxury (S-Class)',
      rates: { base: 90, perKm: [3.0, 2.5], perMin: 1.0, hourly: [80, 95], minimum: 100 }
    },
    [VEHICLE_TYPES.SUV]: {
      name: 'SUV (Range Rover)',
      rates: { base: 120, perKm: [3.5, 3.0], perMin: 1.25, hourly: [110, 125], minimum: 120 }
    },
    [VEHICLE_TYPES.VAN]: {
      name: 'Van/MPV (V-Class)',
      rates: { base: 100, perKm: [3.25, 2.75], perMin: 1.1, hourly: [90, 105], minimum: 100 }
    }
  },

  multipliers: {
    time: {
      [TIME_PERIODS.DAY]: 1.0,
      [TIME_PERIODS.NIGHT]: 1.3,
      [TIME_PERIODS.PEAK_MORNING]: 1.2,
      [TIME_PERIODS.PEAK_EVENING]: 1.2,
      [TIME_PERIODS.WEEKEND]: 1.15
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
    minimums: { distance: 5.0, time: 10 }
  },

  policies: {
    rounding: { to: 5, direction: 'up' },
    cancellation: { freeHours: 2, chargeRate: 1.0 },
    corporate: { tier1: 0.1, tier2: 0.15 }
  }
};

// Time configuration for dynamic multipliers
const TIME_CONFIG = {
  peakMorning: { start: '07:00', end: '09:00', days: [1,2,3,4,5] },
  peakEvening: { start: '17:00', end: '19:00', days: [1,2,3,4,5] },
  night: { start: '22:00', end: '06:00', days: [0,1,2,3,4,5,6] },
  weekend: { days: [0,6] }
};

module.exports = {
  VEHICLE_TYPES,
  BOOKING_TYPES,
  TIME_PERIODS,
  PRICING_CONFIG,
  TIME_CONFIG
};

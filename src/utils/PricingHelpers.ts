/**
 * Pricing Helper Utilities - TypeScript implementation
 * Clean, reusable helper functions
 */

import { TimePeriod, Coordinates } from '../types/pricing.types';

/** UK bookings use London wall-clock for peak/weekend/night rules (not UTC / browser TZ). */
export const PRICING_TIMEZONE = 'Europe/London';

// Default time period config (fallback if Supabase doesn't have it)
const DEFAULT_TIME_CONFIG = {
  peak_morning: { start: '07:00', end: '09:00', days: [1, 2, 3, 4, 5, 6, 0] },
  peak_evening: { start: '17:00', end: '19:00', days: [1, 2, 3, 4, 5, 6, 0] },
  night: { start: '22:00', end: '06:00', days: [0, 1, 2, 3, 4, 5, 6] },
  weekend: { days: [0, 6] },
};

export type TimePeriodConfig = typeof DEFAULT_TIME_CONFIG;

export type LondonWallClock = {
  day: number;
  timeString: string;
};

const TIME_RULE_PRIORITY: TimePeriod[] = [
  TimePeriod.WEEKEND,
  TimePeriod.PEAK_MORNING,
  TimePeriod.PEAK_EVENING,
  TimePeriod.NIGHT,
];

export class PricingHelpers {
  /**
   * Wall-clock date/time in Europe/London (matches landing mergeDateAndTime).
   */
  public static getLondonWallClock(
    dateTime: Date,
    timeZone: string = PRICING_TIMEZONE
  ): LondonWallClock {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(dateTime);

    const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
    const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
    const minute = parts.find(p => p.type === 'minute')?.value ?? '00';

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      day: dayMap[weekday] ?? dateTime.getUTCDay(),
      timeString: `${hour}:${minute}`,
    };
  }

  /**
   * Whether a named rule matches the pickup instant in London local time.
   */
  public static matchesTimeRule(
    ruleName: string,
    wallClock: LondonWallClock,
    config: TimePeriodConfig
  ): boolean {
    const ruleConfig = (config as Record<string, { start?: string; end?: string; days?: number[] }>)[
      ruleName
    ];
    if (!ruleConfig) {
      return false;
    }

    if (ruleName === 'weekend' || (!ruleConfig.start && ruleConfig.days)) {
      const weekendDays = ruleConfig.days ?? DEFAULT_TIME_CONFIG.weekend.days;
      return weekendDays.includes(wallClock.day);
    }

    if (!ruleConfig.start || !ruleConfig.end) {
      return false;
    }

    if (ruleConfig.days && !ruleConfig.days.includes(wallClock.day)) {
      return false;
    }

    return this.isInTimeRange(wallClock.timeString, {
      start: ruleConfig.start,
      end: ruleConfig.end,
    });
  }

  /**
   * Pick the single highest active time multiplier (do not stack, do not use priority order).
   */
  public static resolveBestTimeMultiplier(
    dateTime: Date,
    timeRules: Array<{ rule_name: string; multiplier: string | number }>,
    timePeriodConfig?: TimePeriodConfig
  ): { period: string; multiplier: number } | null {
    const config = timePeriodConfig || DEFAULT_TIME_CONFIG;
    const wallClock = this.getLondonWallClock(dateTime);

    let best: { period: string; multiplier: number } | null = null;

    for (const periodName of TIME_RULE_PRIORITY) {
      if (!this.matchesTimeRule(periodName, wallClock, config)) {
        continue;
      }

      const rule = timeRules.find(r => r.rule_name === periodName);
      const factor = rule ? parseFloat(String(rule.multiplier)) : 1.0;
      if (factor <= 1) {
        continue;
      }

      if (!best || factor > best.multiplier) {
        best = { period: periodName, multiplier: factor };
      }
    }

    return best;
  }

  /**
   * @deprecated Prefer resolveBestTimeMultiplier — kept for compatibility.
   */
  public static getTimePeriod(
    dateTime: Date,
    timePeriodConfig?: TimePeriodConfig
  ): TimePeriod {
    const best = this.resolveBestTimeMultiplier(dateTime, [], timePeriodConfig);
    if (!best) {
      return TimePeriod.DAY;
    }
    return best.period as TimePeriod;
  }

  /**
   * Check if time is within specified range
   */
  private static isInTimeRange(timeString: string, config: { start: string; end: string }): boolean {
    const time = this.timeToMinutes(timeString);
    const start = this.timeToMinutes(config.start);
    const end = this.timeToMinutes(config.end);

    // Handle overnight ranges (e.g., 22:00 to 06:00)
    if (start > end) {
      return time >= start || time <= end;
    }
    return time >= start && time <= end;
  }

  /**
   * Convert time string to minutes for comparison
   */
  private static timeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Detect airport from address
   */
  public static detectAirport(address: string): string | null {
    const airportPatterns: Record<string, string[]> = {
      LHR: ['heathrow', 'lhr', 'tw6'],
      LGW: ['gatwick', 'lgw', 'rh6'], 
      STN: ['stansted', 'stn', 'cm24'],
      LTN: ['luton', 'ltn', 'lu2'],
      LCY: ['london city', 'lcy', 'e16']
    };

    const addressLower = address.toLowerCase();
    
    for (const [code, patterns] of Object.entries(airportPatterns)) {
      if (patterns.some(pattern => addressLower.includes(pattern))) {
        return code;
      }
    }

    return null;
  }

  /**
   * Detect special zones from addresses
   */
  public static detectZones(pickup: string, dropoff: string): string[] {
    const zones: string[] = [];
    const addresses = [pickup.toLowerCase(), dropoff.toLowerCase()];
    
    addresses.forEach(address => {
      if (this.isCentralLondon(address)) zones.push('central');
      if (this.isULEZ(address)) zones.push('ulez');
      if (this.isLEZ(address)) zones.push('lez');
    });

    return [...new Set(zones)]; // Remove duplicates
  }

  private static isCentralLondon(address: string): boolean {
    const centralAreas = [
      'central london', 'city of london', 'zone 1', 'mayfair', 
      'covent garden', 'westminster', 'marylebone', 'fitzrovia'
    ];
    return centralAreas.some(area => address.includes(area));
  }

  private static isULEZ(address: string): boolean {
    return address.includes('ulez') || this.isCentralLondon(address);
  }

  private static isLEZ(address: string): boolean {
    return address.includes('greater london') || address.includes('m25');
  }

  /**
   * Apply rounding policy
   */
  public static applyRounding(
    amount: number, 
    policy: { to: number; direction: 'up' | 'down' | 'nearest' }
  ): number {
    const { to, direction } = policy;
    
    if (to === 0) return amount; // No rounding
    
    switch (direction) {
      case 'up':
        return Math.ceil(amount / to) * to;
      case 'down':
        return Math.floor(amount / to) * to;
      case 'nearest':
        return Math.round(amount / to) * to;
      default:
        return amount;
    }
  }

  /**
   * Format price for display
   */
  public static formatPrice(amount: number, currency: string = 'GBP'): string {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Calculate distance between coordinates (Haversine formula)
   */
  public static calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.degToRad(coord2.lat - coord1.lat);
    const dLng = this.degToRad(coord2.lng - coord1.lng);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.degToRad(coord1.lat)) * Math.cos(this.degToRad(coord2.lat)) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  }

  private static degToRad(deg: number): number {
    return deg * (Math.PI/180);
  }

  /**
   * Validate coordinates
   */
  public static isValidCoordinates(coords: Coordinates): boolean {
    return coords.lat >= -90 && coords.lat <= 90 && 
           coords.lng >= -180 && coords.lng <= 180;
  }
}

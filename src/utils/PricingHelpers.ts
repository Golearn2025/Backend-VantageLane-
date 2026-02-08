/**
 * Pricing Helper Utilities - TypeScript implementation
 * Clean, reusable helper functions
 */

import { TimePeriod, Coordinates } from '../types/pricing.types';

// Default time period config (fallback if Supabase doesn't have it)
const DEFAULT_TIME_CONFIG = {
  peak_morning: { start: '07:00', end: '09:00', days: [1,2,3,4,5] },
  peak_evening: { start: '17:00', end: '19:00', days: [1,2,3,4,5] },
  night: { start: '22:00', end: '06:00', days: [0,1,2,3,4,5,6] },
  weekend: { days: [0,6] }
};

export class PricingHelpers {
  
  /**
   * Determine time period based on date/time
   */
  public static getTimePeriod(dateTime: Date, timePeriodConfig?: typeof DEFAULT_TIME_CONFIG): TimePeriod {
    const config = timePeriodConfig || DEFAULT_TIME_CONFIG;
    const hour = dateTime.getUTCHours();
    const day = dateTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const timeString = `${hour.toString().padStart(2, '0')}:00`;

    // Weekend check
    if (config.weekend.days.includes(day)) {
      return TimePeriod.WEEKEND;
    }

    // Peak hours check
    if (this.isInTimeRange(timeString, config.peak_morning) && 
        config.peak_morning.days.includes(day)) {
      return TimePeriod.PEAK_MORNING;
    }

    if (this.isInTimeRange(timeString, config.peak_evening) && 
        config.peak_evening.days.includes(day)) {
      return TimePeriod.PEAK_EVENING;
    }

    // Night check
    if (this.isInTimeRange(timeString, config.night)) {
      return TimePeriod.NIGHT;
    }

    return TimePeriod.DAY;
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

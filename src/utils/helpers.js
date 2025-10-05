/**
 * Utility functions for pricing calculations
 * Reusable, clean helper methods
 */

const { TIME_CONFIG, TIME_PERIODS } = require('../config/base');

class PricingHelpers {
  /**
   * Determine time period based on date/time
   */
  static getTimePeriod(dateTime) {
    const hour = dateTime.getHours();
    const day = dateTime.getDay(); // 0 = Sunday, 6 = Saturday
    const timeString = `${hour.toString().padStart(2, '0')}:00`;

    // Weekend check
    if (TIME_CONFIG.weekend.days.includes(day)) {
      return TIME_PERIODS.WEEKEND;
    }

    // Peak hours check
    if (this.isInTimeRange(timeString, TIME_CONFIG.peakMorning) && 
        TIME_CONFIG.peakMorning.days.includes(day)) {
      return TIME_PERIODS.PEAK_MORNING;
    }

    if (this.isInTimeRange(timeString, TIME_CONFIG.peakEvening) && 
        TIME_CONFIG.peakEvening.days.includes(day)) {
      return TIME_PERIODS.PEAK_EVENING;
    }

    // Night check
    if (this.isInTimeRange(timeString, TIME_CONFIG.night)) {
      return TIME_PERIODS.NIGHT;
    }

    return TIME_PERIODS.DAY;
  }

  /**
   * Check if time is within specified range
   */
  static isInTimeRange(timeString, config) {
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
  static timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Detect airport from coordinates or address
   */
  static detectAirport(address, coordinates = null) {
    const airportPatterns = {
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
   * Calculate distance fee with tiered pricing
   */
  static calculateDistanceFee(distanceKm, rates, minimumKm = 0) {
    const actualDistance = Math.max(distanceKm, minimumKm);
    const first10km = Math.min(actualDistance, 10);
    const remaining = Math.max(actualDistance - 10, 0);
    
    return (first10km * rates[0]) + (remaining * rates[1]);
  }

  /**
   * Apply rounding policy
   */
  static applyRounding(amount, policy) {
    const { to, direction } = policy;
    
    if (to === 0) return amount; // No rounding
    
    if (direction === 'up') {
      return Math.ceil(amount / to) * to;
    } else if (direction === 'down') {
      return Math.floor(amount / to) * to;
    } else {
      return Math.round(amount / to) * to;
    }
  }

  /**
   * Detect special zones (congestion, ULEZ, etc.)
   */
  static detectZones(pickup, dropoff, coordinates = null) {
    const zones = [];
    
    // Simple detection based on common area names
    const addresses = [pickup.toLowerCase(), dropoff.toLowerCase()];
    
    addresses.forEach(address => {
      if (this.isCentralLondon(address)) zones.push('central');
      if (this.isULEZ(address)) zones.push('ulez');
      if (this.isLEZ(address)) zones.push('lez');
    });

    return [...new Set(zones)]; // Remove duplicates
  }

  static isCentralLondon(address) {
    const centralAreas = ['central london', 'city of london', 'zone 1', 'mayfair', 'covent garden'];
    return centralAreas.some(area => address.includes(area));
  }

  static isULEZ(address) {
    // Simplified ULEZ detection
    return address.includes('ulez') || this.isCentralLondon(address);
  }

  static isLEZ(address) {
    // Simplified LEZ detection  
    return address.includes('greater london') || address.includes('m25');
  }

  /**
   * Format price for display
   */
  static formatPrice(amount, currency = 'GBP') {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  }
}

module.exports = PricingHelpers;

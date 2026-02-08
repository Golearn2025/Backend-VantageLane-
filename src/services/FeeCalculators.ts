/**
 * Fee Calculators - Individual fee calculation methods
 * Extracted from PricingEngine for modularity
 */

import { 
  PricingRequestData, 
  BookingType,
  VehicleType,
  PricingBreakdownData,
  PricingConfig
} from '../types/pricing.types';
import { PricingHelpers } from '../utils/PricingHelpers';
import { TollRoadDetector } from '../utils/TollRoadDetector';
import { PricingConfigAdapter } from './PricingConfigAdapter';
import { PricingConfigService } from './PricingConfigService';

export class FeeCalculators {

  /**
   * Calculate base fare
   */
  static calculateBaseFare(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    const vehicleConfig = config.vehicles[request.vehicleType];
    breakdown.baseFare = vehicleConfig.rates.base;
    
    breakdown.details.push({
      component: 'base_fare',
      amount: breakdown.baseFare,
      description: `${vehicleConfig.name} base fare`
    });
  }

  /**
   * Calculate hourly fee for hourly bookings
   * Reads rates from hourly_settings.rates in Supabase
   */
  static calculateHourlyFee(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    const requestedHours = request.hours || 3;
    
    const hourlySettings = config.hourly_settings || {
      rates: {},
      minimum_hours: 3,
      maximum_hours: 12
    };
    
    const billableHours = Math.min(
      Math.max(requestedHours, hourlySettings.minimum_hours || 3),
      hourlySettings.maximum_hours || 12
    );

    // Priority: hourly_settings.rates[vehicleType] > vehicle_types hourly rate
    const vehicleKey = request.vehicleType as string;
    const hourlyRate = hourlySettings.rates?.[vehicleKey] 
      || (Array.isArray(config.vehicles[request.vehicleType]?.rates?.hourly)
          ? config.vehicles[request.vehicleType].rates.hourly[0]
          : 80);
    
    const hourlyFee = billableHours * hourlyRate;
    
    breakdown.timeFee = hourlyFee;
    
    breakdown.details.push({
      component: 'hourly_fee',
      amount: hourlyFee,
      description: `${billableHours} hours at £${hourlyRate}/hr`
    });
  }

  /**
   * Calculate daily fee for daily bookings
   * Reads rates from daily_settings.rates in Supabase
   */
  static calculateDailyFee(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    const requestedDays = request.days || 1;

    const dailySettings = config.daily_settings || {
      rates: {},
      minimum_days: 1,
      maximum_days: 7,
      hours_per_day: 8
    };

    const billableDays = Math.min(
      Math.max(requestedDays, dailySettings.minimum_days || 1),
      dailySettings.maximum_days || 7
    );

    // Priority: daily_settings.rates[vehicleType] > hourly × hours_per_day fallback
    const vehicleKey = request.vehicleType as string;
    const hoursPerDay = dailySettings.hours_per_day || 8;
    const hourlySettings = config.hourly_settings || { rates: {} as Record<string, number> };
    const dailyRate = dailySettings.rates?.[vehicleKey]
      || (hourlySettings.rates?.[vehicleKey] ? hourlySettings.rates[vehicleKey] * hoursPerDay : 640);

    const dailyFee = billableDays * dailyRate;

    breakdown.timeFee = dailyFee;

    breakdown.details.push({
      component: 'daily_fee',
      amount: dailyFee,
      description: `${billableDays} day${billableDays > 1 ? 's' : ''} at £${dailyRate}/day (${hoursPerDay}h/day)`
    });
  }

  /**
   * Calculate distance fee with tiered pricing (UK miles)
   */
  static calculateDistanceFee(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    if (!request.distance) return;

    const vehicleConfig = config.vehicles[request.vehicleType];
    const minimumMiles = config.services.minimums.distance;
    
    // Convert km to miles if needed (Google Maps returns km, but we price in miles)
    const distanceInMiles = request.distance * 0.621371; // km to miles conversion
    
    const actualDistance = Math.max(distanceInMiles, minimumMiles);
    const first6miles = Math.min(actualDistance, 6); // First 6 miles at higher rate
    const remaining = Math.max(actualDistance - 6, 0);
    
    const first6Fee = first6miles * vehicleConfig.rates.perMile[0];
    const remainingFee = remaining * vehicleConfig.rates.perMile[1];
    
    breakdown.distanceFee = first6Fee + remainingFee;
    
    breakdown.details.push({
      component: 'distance_fee',
      amount: breakdown.distanceFee,
      description: `${actualDistance.toFixed(1)} miles (£${vehicleConfig.rates.perMile[0]}/£${vehicleConfig.rates.perMile[1]} per mile)`
    });
  }

  /**
   * Calculate time fee
   */
  static calculateTimeFee(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    if (!request.duration) return;

    const vehicleConfig = config.vehicles[request.vehicleType];
    const minimumMinutes = config.services.minimums.time;
    
    const actualTime = Math.max(request.duration, minimumMinutes);
    breakdown.timeFee = actualTime * vehicleConfig.rates.perMin;
    
    breakdown.details.push({
      component: 'time_fee',
      amount: breakdown.timeFee,
      description: `${actualTime} minutes at £${vehicleConfig.rates.perMin}/min`
    });
  }

  /**
   * Calculate zone-based fees
   */
  static calculateZoneFees(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    // Airport fees
    const pickupAirport = PricingHelpers.detectAirport(request.pickup);
    const dropoffAirport = PricingHelpers.detectAirport(request.dropoff);
    
    if (pickupAirport && config.zones.airports[pickupAirport]) {
      const fee = config.zones.airports[pickupAirport].fee;
      breakdown.airportFees += fee;
      breakdown.details.push({
        component: 'airport_pickup',
        amount: fee,
        description: `${pickupAirport} pickup fee`
      });
    }
    
    if (dropoffAirport && config.zones.airports[dropoffAirport] && dropoffAirport !== pickupAirport) {
      const fee = config.zones.airports[dropoffAirport].fee;
      breakdown.airportFees += fee;
      breakdown.details.push({
        component: 'airport_dropoff',
        amount: fee,
        description: `${dropoffAirport} dropoff fee`
      });
    }

    // Congestion and zone fees
    const zones = PricingHelpers.detectZones(request.pickup, request.dropoff);
    zones.forEach(zone => {
      if (config.zones.congestion[zone]) {
        const fee = config.zones.congestion[zone];
        breakdown.zoneFees += fee;
        breakdown.details.push({
          component: 'zone_fee',
          amount: fee,
          description: `${zone} zone charge`
        });
      }
    });
  }

  /**
   * Calculate toll fees by detecting toll roads from address names (no API call)
   */
  static async calculateTollFees(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): Promise<void> {
    try {
      const addresses = `${request.pickup} ${request.dropoff}`.toLowerCase();
      
      const tollChecks: { keyword: string[]; code: string; name: string }[] = [
        { keyword: ['dartford', 'dart crossing', 'thurrock'], code: 'dartford', name: 'Dartford Crossing' },
        { keyword: ['m6 toll', 'm6toll'], code: 'm6', name: 'M6 Toll' }
      ];

      tollChecks.forEach(toll => {
        if (toll.keyword.some(kw => addresses.includes(kw))) {
          const fee = TollRoadDetector.getTollFee(toll.code, config);
          if (fee > 0) {
            breakdown.tollFees += fee;
            breakdown.details.push({
              component: 'toll_fee',
              amount: fee,
              description: `${toll.name} toll`
            });
          }
        }
      });
    } catch (error) {
      console.error('Error calculating toll fees:', error);
    }
  }

  /**
   * Calculate additional services using Supabase premium_services config
   */
  static async calculateAdditionalServices(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): Promise<void> {
    // Multi-stop fee (if applicable)
    if (request.extras?.includes('multi_stop')) {
      const fee = config.services.multiStop;
      breakdown.multiStopFees += fee;
      breakdown.details.push({
        component: 'multi_stop',
        amount: fee,
        description: 'Additional stop'
      });
    }

    // Get Supabase config for premium services
    const dbConfig = await PricingConfigService.getActivePricingConfig();

    // Other extras - get prices from Supabase
    const extraServices = request.extras?.filter(extra => extra !== 'multi_stop') || [];
    extraServices.forEach(extra => {
      const fee = PricingConfigAdapter.getPremiumServicePrice(dbConfig, extra);
      
      if (fee > 0) {
        let description = '';
        
        switch (extra) {
          case 'child_seat':
            description = 'Child safety seat';
            break;
          case 'champagne':
          case 'champagne_premium':
            description = 'Champagne service (Premium)';
            break;
          case 'champagne_exclusive':
            description = 'Champagne service (Exclusive)';
            break;
          case 'flowers':
          case 'flowers_standard':
          case 'fresh_flowers':
            description = 'Fresh flowers (Standard)';
            break;
          case 'flowers_premium':
            description = 'Fresh flowers (Premium)';
            break;
          case 'security':
          case 'security_escort':
            description = 'Security escort';
            break;
          case 'meet_greet':
          case 'meet_and_greet':
            description = 'Meet & greet service';
            break;
          default:
            description = extra.replace(/_/g, ' ');
        }
        
        breakdown.extraServices += fee;
        breakdown.details.push({
          component: 'extra_service',
          amount: fee,
          description
        });
      }
    });
  }

  /**
   * Apply time-based multipliers
   */
  static applyMultipliers(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    const dateTime = new Date(request.dateTime);
    const timePeriod = PricingHelpers.getTimePeriod(dateTime, config.time_period_config);
    const multiplier = config.multipliers.time[timePeriod];
    
    if (multiplier !== 1.0) {
      const multiplierAmount = breakdown.subtotal * (multiplier - 1);
      breakdown.multipliers[timePeriod] = multiplier;
      
      breakdown.details.push({
        component: 'multiplier',
        amount: multiplierAmount,
        description: `${timePeriod} surcharge (${((multiplier - 1) * 100).toFixed(0)}%)`
      });
      
      breakdown.subtotal += multiplierAmount;
    }
  }

  /**
   * Apply corporate discounts
   */
  static applyDiscounts(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    if (request.corporateTier) {
      let discountRate = 0;
      
      if (request.corporateTier === 'tier1') {
        discountRate = config.policies.corporate.tier1;
      } else if (request.corporateTier === 'tier2') {
        discountRate = config.policies.corporate.tier2;
      }
      
      if (discountRate > 0) {
        const discountAmount = breakdown.subtotal * discountRate;
        breakdown.discounts = discountAmount;
        
        breakdown.details.push({
          component: 'discount',
          amount: -discountAmount,
          description: `Corporate discount (${(discountRate * 100).toFixed(0)}%)`
        });
        
        breakdown.subtotal -= discountAmount;
      }
    }
  }

  /**
   * Apply minimum fare policy
   */
  static applyMinimumFare(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    const vehicleConfig = config.vehicles[request.vehicleType];
    const minimumFare = vehicleConfig.rates.minimum;
    
    if (breakdown.subtotal < minimumFare) {
      const adjustment = minimumFare - breakdown.subtotal;
      breakdown.details.push({
        component: 'minimum_fare',
        amount: adjustment,
        description: `Minimum fare adjustment`
      });
      breakdown.finalPrice = minimumFare;
    } else {
      breakdown.finalPrice = breakdown.subtotal;
    }
  }

  /**
   * Helper: Calculate distance fee for a specific vehicle type (used by fleet)
   */
  static calculateDistanceFeeForVehicle(distanceMiles: number, vehicleType: VehicleType, config: PricingConfig): number {
    const vehicleConfig = config.vehicles[vehicleType];
    const perMileRates = vehicleConfig.rates.perMile;
    
    // Tiered pricing: different rates for first 6 miles vs 6+ miles
    const tier1Miles = Math.min(distanceMiles, 6);
    const tier2Miles = Math.max(0, distanceMiles - 6);
    
    const tier1Rate = Array.isArray(perMileRates) ? perMileRates[0] : perMileRates;
    const tier2Rate = Array.isArray(perMileRates) ? perMileRates[1] : perMileRates;
    
    return (tier1Miles * tier1Rate) + (tier2Miles * tier2Rate);
  }
}

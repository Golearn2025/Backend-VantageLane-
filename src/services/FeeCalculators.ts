/**
 * Fee Calculators - Refactored to use database views via PricingDataService
 * 
 * CHANGES FROM OLD VERSION:
 * - Removed dependency on PricingConfig JSONB
 * - Now reads from normalized database views
 * - All methods are now async
 * - Uses PricingDataService instead of PricingConfigService
 */

import { 
  PricingRequestData, 
  BookingType,
  VehicleType,
  PricingBreakdownData
} from '../types/pricing.types';
import { PricingHelpers } from '../utils/PricingHelpers';
import { PricingDataService } from './PricingDataService';

export class FeeCalculators {

  /**
   * Calculate base fare
   * Reads from: v_pricing_vehicle_rates
   */
  static async calculateBaseFare(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    const rates = await PricingDataService.getVehicleRates(
      request.vehicleType,
      request.bookingType,
      request.organizationId
    );
    
    // Convert pence to pounds
    breakdown.baseFare = PricingDataService.penceToPounds(rates.base_fare_pence);
    
    breakdown.details.push({
      component: 'base_fare',
      amount: breakdown.baseFare,
      description: `${rates.vehicle_category} base fare`
    });
  }

  /**
   * Calculate hourly fee for hourly bookings
   * Reads from: v_pricing_hourly_rules
   */
  static async calculateHourlyFee(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    const requestedHours = request.hours || 3;
    
    const hourlyRules = await PricingDataService.getHourlyRules(request.vehicleType, request.organizationId);
    const rates = await PricingDataService.getVehicleRates(request.vehicleType, 'hourly', request.organizationId);
    
    const billableHours = Math.min(
      Math.max(requestedHours, hourlyRules.minimum_hours),
      hourlyRules.maximum_hours
    );

    // Convert pence to pounds
    const hourlyRate = PricingDataService.penceToPounds(rates.hourly_rate_pence);
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
   * Reads from: v_pricing_daily_rules
   */
  static async calculateDailyFee(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    const requestedDays = request.days || 1;

    const dailyRules = await PricingDataService.getDailyRules(request.vehicleType, request.organizationId);
    const rates = await PricingDataService.getVehicleRates(request.vehicleType, 'daily', request.organizationId);

    // Daily rules define included hours/miles and extra rates
    // Use daily_rate_pence from vehicle_rates for the base daily rate
    const billableDays = requestedDays; // No min/max in current schema

    // Convert pence to pounds
    const dailyRate = PricingDataService.penceToPounds(rates.daily_rate_pence);
    const dailyFee = billableDays * dailyRate;

    breakdown.timeFee = dailyFee;

    breakdown.details.push({
      component: 'daily_fee',
      amount: dailyFee,
      description: `${billableDays} days at £${dailyRate}/day (${dailyRules.included_hours}hrs included)`
    });
  }

  /**
   * Calculate distance fee (tiered pricing)
   * Reads from: v_pricing_vehicle_rates
   */
  static async calculateDistanceFee(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (!request.distance) return;

    const rates = await PricingDataService.getVehicleRates(
      request.vehicleType,
      request.bookingType,
      request.organizationId
    );
    
    // Distance is already in miles from frontend
    const distanceInMiles = request.distance;
    
    // Tiered pricing: first 6 miles at higher rate, rest at lower rate
    const first6miles = Math.min(distanceInMiles, 6);
    const remaining = Math.max(distanceInMiles - 6, 0);
    
    // Convert pence to pounds
    const perMileRate1 = PricingDataService.penceToPounds(rates.per_mile_first_6_pence);
    const perMileRate2 = PricingDataService.penceToPounds(rates.per_mile_after_6_pence);
    
    const first6Fee = first6miles * perMileRate1;
    const remainingFee = remaining * perMileRate2;
    
    breakdown.distanceFee = first6Fee + remainingFee;
    
    breakdown.details.push({
      component: 'distance_fee',
      amount: breakdown.distanceFee,
      description: `${distanceInMiles.toFixed(1)} miles (${first6miles.toFixed(1)} @ £${perMileRate1}/mi + ${remaining.toFixed(1)} @ £${perMileRate2}/mi)`
    });
  }

  /**
   * Calculate time fee (per minute)
   * Reads from: v_pricing_vehicle_rates
   */
  static async calculateTimeFee(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (!request.duration) return;

    const rates = await PricingDataService.getVehicleRates(
      request.vehicleType,
      request.bookingType,
      request.organizationId
    );
    
    const actualTime = request.duration;
    
    // Convert pence to pounds
    const perMinRate = PricingDataService.penceToPounds(rates.per_minute_pence);
    breakdown.timeFee = actualTime * perMinRate;
    
    breakdown.details.push({
      component: 'time_fee',
      amount: breakdown.timeFee,
      description: `${actualTime} minutes at £${perMinRate}/min`
    });
  }

  /**
   * Calculate zone fees (airports, congestion zones)
   * Reads from: v_pricing_airport_fees, v_pricing_zone_fees
   */
  static async calculateZoneFees(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    // Airport fees
    const pickupAirport = PricingHelpers.detectAirport(request.pickup);
    const dropoffAirport = PricingHelpers.detectAirport(request.dropoff);
    
    if (pickupAirport) {
      const airportFee = await PricingDataService.getAirportFee(pickupAirport);
      if (airportFee) {
        const fee = PricingDataService.penceToPounds(airportFee.pickup_fee_pence);
        breakdown.airportFees += fee;
        breakdown.details.push({
          component: 'airport_pickup',
          amount: fee,
          description: `${pickupAirport} pickup fee`
        });
      }
    }
    
    if (dropoffAirport && dropoffAirport !== pickupAirport) {
      const airportFee = await PricingDataService.getAirportFee(dropoffAirport);
      if (airportFee) {
        const fee = PricingDataService.penceToPounds(airportFee.dropoff_fee_pence || airportFee.pickup_fee_pence);
        breakdown.airportFees += fee;
        breakdown.details.push({
          component: 'airport_dropoff',
          amount: fee,
          description: `${dropoffAirport} dropoff fee`
        });
      }
    }
    
    // Congestion and zone fees
    const zones = PricingHelpers.detectZones(request.pickup, request.dropoff);
    for (const zone of zones) {
      const zoneFee = await PricingDataService.getZoneFee(zone);
      if (zoneFee) {
        const fee = PricingDataService.penceToPounds(zoneFee.fee_pence);
        breakdown.zoneFees += fee;
        breakdown.details.push({
          component: 'zone_fee',
          amount: fee,
          description: `${zoneFee.zone_name || zone} zone fee`
        });
      }
    }
  }

  /**
   * Calculate toll fees
   * Reads from: v_pricing_zone_fees (tolls are stored as zone_type='toll')
   */
  static async calculateTollFees(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    // Detect toll roads from addresses (keyword-based)
    const addresses = [request.pickup.toLowerCase(), request.dropoff.toLowerCase()];
    const tollKeywords = {
      'dartford': 'dartford',
      'm6 toll': 'm6_toll'
    };
    
    for (const address of addresses) {
      for (const [keyword, tollCode] of Object.entries(tollKeywords)) {
        if (address.includes(keyword)) {
          const tollFee = await PricingDataService.getZoneFee(tollCode);
          if (tollFee) {
            const fee = PricingDataService.penceToPounds(tollFee.fee_pence);
            breakdown.tollFees += fee;
            breakdown.details.push({
              component: 'toll_fee',
              amount: fee,
              description: `${tollFee.zone_name || tollCode} toll`
            });
          }
          break;
        }
      }
    }
  }

  /**
   * Calculate additional services fees
   * Reads from: v_active_pricing_version (multi-stop fee)
   */
  static async calculateAdditionalServices(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    // Multi-stop fee
    if (request.extras?.includes('multi_stop')) {
      const policies = await PricingDataService.getServicePolicies();
      const fee = policies.multiStop;
      breakdown.multiStopFees += fee;
      breakdown.details.push({
        component: 'multi_stop',
        amount: fee,
        description: 'Multi-stop service'
      });
    }
    
    // Premium services (child seat, champagne, flowers, etc.)
    // Note: These would need to be in a separate premium_services table/view
    // For now, skipping as they're not in the normalized structure yet
    const otherExtras = request.extras?.filter(e => e !== 'multi_stop') || [];
    if (otherExtras.length > 0) {
      // TODO: Query premium services table when available
      console.log('Premium services requested but not yet implemented in normalized DB:', otherExtras);
    }
  }

  /**
   * Apply time-based multipliers
   * Reads from: v_pricing_time_rules
   */
  static async applyMultipliers(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    const dateTime = new Date(request.dateTime);
    
    // Get time rules to determine time period config
    const timeRules = await PricingDataService.getTimeRules();
    
    // Build time period config from rules
    const timePeriodConfig: any = {};
    timeRules.forEach(rule => {
      if (rule.start_time && rule.end_time) {
        timePeriodConfig[rule.rule_name] = {
          start: rule.start_time,
          end: rule.end_time,
          days: rule.day_of_week !== null ? [rule.day_of_week] : [0, 1, 2, 3, 4, 5, 6]
        };
      } else {
        timePeriodConfig[rule.rule_name] = {
          days: rule.day_of_week !== null ? [rule.day_of_week] : []
        };
      }
    });
    
    const timePeriod = PricingHelpers.getTimePeriod(dateTime, timePeriodConfig);
    
    // Find the multiplier for this period
    const rule = timeRules.find(r => r.rule_name === timePeriod);
    const multiplier = rule ? parseFloat(rule.multiplier) : 1.0;
    
    if (multiplier !== 1.0) {
      const multiplierAmount = breakdown.subtotal * (multiplier - 1);
      breakdown.multipliers[timePeriod] = multiplier;
      breakdown.subtotal += multiplierAmount;
      
      breakdown.details.push({
        component: 'time_multiplier',
        amount: multiplierAmount,
        description: `${timePeriod} multiplier (${multiplier}x)`
      });
    }
  }

  /**
   * Apply corporate discounts
   * Reads from: v_active_pricing_version
   */
  static async applyDiscounts(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (request.corporateTier) {
      const discounts = await PricingDataService.getCorporateDiscounts();
      
      let discountRate = 0;
      
      if (request.corporateTier === 'tier1') {
        discountRate = discounts.tier1;
      } else if (request.corporateTier === 'tier2') {
        discountRate = discounts.tier2;
      }
      
      if (discountRate > 0) {
        const discountAmount = breakdown.subtotal * discountRate;
        breakdown.discounts += discountAmount;
        
        breakdown.details.push({
          component: 'corporate_discount',
          amount: -discountAmount,
          description: `Corporate ${request.corporateTier} discount (${(discountRate * 100).toFixed(0)}%)`
        });
      }
    }
  }

  /**
   * Apply minimum fare policy
   * Reads from: v_pricing_vehicle_rates
   */
  static async applyMinimumFare(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    const rates = await PricingDataService.getVehicleRates(
      request.vehicleType,
      request.bookingType,
      request.organizationId
    );
    
    const minimumFare = PricingDataService.penceToPounds(rates.minimum_fare_pence);
    
    if (breakdown.subtotal < minimumFare) {
      const adjustment = minimumFare - breakdown.subtotal;
      breakdown.subtotal = minimumFare;
      
      breakdown.details.push({
        component: 'minimum_fare',
        amount: adjustment,
        description: `Minimum fare adjustment (£${minimumFare} minimum)`
      });
    }
  }

  /**
   * Helper: Calculate distance fee for a specific vehicle type (used by fleet)
   * Reads from: v_pricing_vehicle_rates
   */
  static async calculateDistanceFeeForVehicle(distanceMiles: number, vehicleType: VehicleType, bookingType: BookingType): Promise<number> {
    const rates = await PricingDataService.getVehicleRates(vehicleType, bookingType);
    
    const first6miles = Math.min(distanceMiles, 6);
    const remaining = Math.max(distanceMiles - 6, 0);
    
    const perMileRate1 = PricingDataService.penceToPounds(rates.per_mile_first_6_pence);
    const perMileRate2 = PricingDataService.penceToPounds(rates.per_mile_after_6_pence);
    
    return (first6miles * perMileRate1) + (remaining * perMileRate2);
  }
}

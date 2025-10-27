/**
 * Core Pricing Engine - TypeScript implementation
 * Professional, modular pricing calculation system
 * NOW POWERED BY SUPABASE! 🚀
 */

import { 
  PricingRequestData, 
  PricingResult, 
  VehicleType, 
  BookingType,
  TimePeriod,
  PricingBreakdownData,
  PricingDetail,
  PricingConfig
} from '../types/pricing.types';
import { PricingConfigService } from './PricingConfigService';
import { PricingConfigAdapter } from './PricingConfigAdapter';
import { PricingHelpers } from '../utils/PricingHelpers';

export class PricingEngine {
  // Pricing config - loaded from Supabase
  private static PRICING_CONFIG: PricingConfig;
  
  /**
   * Main method to calculate pricing
   * NOW ASYNC - fetches config from Supabase
   */
  public static async calculate(request: PricingRequestData): Promise<PricingResult> {
    try {
      // Validate request
      const validationError = this.validateRequest(request);
      if (validationError) {
        return this.createErrorResponse(validationError, 400);
      }

      // Fetch pricing config from Supabase (with caching)
      const dbConfig = await PricingConfigService.getActivePricingConfig();
      this.PRICING_CONFIG = PricingConfigAdapter.toPricingConfig(dbConfig);

      // Initialize breakdown
      const breakdown: PricingBreakdownData = {
        baseFare: 0,
        distanceFee: 0, 
        timeFee: 0,
        airportFees: 0,
        zoneFees: 0,
        tollFees: 0,
        multiStopFees: 0,
        waitingFees: 0,
        extraServices: 0,
        subtotal: 0,
        multipliers: {},
        discounts: 0,
        finalPrice: 0,
        details: []
      };

      // Step 1: Base fare
      this.calculateBaseFare(breakdown, request);

      // Step 2: Calculate main fare (distance/time vs hourly)
      if (request.bookingType === BookingType.HOURLY) {
        this.calculateHourlyFee(breakdown, request);
      } else {
        // Standard per-mile + per-minute calculation
        if (request.distance) {
          this.calculateDistanceFee(breakdown, request);
        }
        if (request.duration) {
          this.calculateTimeFee(breakdown, request);
        }
      }

      // Step 4: Zone fees (airports, congestion, tolls)
      this.calculateZoneFees(breakdown, request);

      // Step 5: Additional services
      this.calculateAdditionalServices(breakdown, request);

      // Step 6: Calculate subtotal
      breakdown.subtotal = breakdown.baseFare + breakdown.distanceFee + breakdown.timeFee + 
                          breakdown.airportFees + breakdown.zoneFees + breakdown.tollFees + 
                          breakdown.multiStopFees + breakdown.waitingFees + breakdown.extraServices;

      // Step 7: Apply multipliers
      this.applyMultipliers(breakdown, request);

      // Step 8: Apply discounts
      this.applyDiscounts(breakdown, request);

      // Step 9: Check minimum fare
      this.applyMinimumFare(breakdown, request);

      // Step 10: Apply rounding
      breakdown.finalPrice = PricingHelpers.applyRounding(
        breakdown.finalPrice || breakdown.subtotal, 
        this.PRICING_CONFIG.policies.rounding
      );

      return this.createSuccessResponse(breakdown);

    } catch (error) {
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Internal calculation error', 
        500
      );
    }
  }

  /**
   * Validate pricing request
   */
  private static validateRequest(request: PricingRequestData): string | null {
    if (!request.pickup || !request.dropoff) {
      return 'Pickup and dropoff locations are required';
    }
    
    if (!Object.values(VehicleType).includes(request.vehicleType)) {
      return 'Invalid vehicle type';
    }
    
    if (!Object.values(BookingType).includes(request.bookingType)) {
      return 'Invalid booking type';
    }

    if (!request.dateTime || isNaN(Date.parse(request.dateTime))) {
      return 'Valid dateTime is required';
    }

    return null;
  }

  /**
   * Calculate base fare
   */
  private static calculateBaseFare(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    const vehicleConfig = this.PRICING_CONFIG.vehicles[request.vehicleType];
    breakdown.baseFare = vehicleConfig.rates.base;
    
    breakdown.details.push({
      component: 'base_fare',
      amount: breakdown.baseFare,
      description: `${vehicleConfig.name} base fare`
    });
  }

  /**
   * Calculate hourly fee for hourly bookings
   */
  private static calculateHourlyFee(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    if (!request.duration) return;

    const vehicleConfig = this.PRICING_CONFIG.vehicles[request.vehicleType];
    const hours = request.duration / 60; // Convert minutes to hours
    
    // Use in-town or out-of-town rate based on distance (simple heuristic)
    const isOutOfTown = (request.distance || 0) > 25; // 25+ miles = out of town
    const hourlyRate = isOutOfTown ? vehicleConfig.rates.hourly[1] : vehicleConfig.rates.hourly[0];
    
    // Minimum 3 hours for hourly bookings (industry standard)
    const billableHours = Math.max(hours, 3);
    const hourlyFee = billableHours * hourlyRate;
    
    // Store in timeFee field for consistency
    breakdown.timeFee = hourlyFee;
    
    breakdown.details.push({
      component: 'hourly_fee',
      amount: hourlyFee,
      description: `${billableHours.toFixed(1)} hours at £${hourlyRate}/hr ${isOutOfTown ? '(out-of-town)' : '(in-town)'}`
    });
  }

  /**
   * Calculate distance fee with tiered pricing (UK miles)
   */
  private static calculateDistanceFee(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    if (!request.distance) return;

    const vehicleConfig = this.PRICING_CONFIG.vehicles[request.vehicleType];
    const minimumMiles = this.PRICING_CONFIG.services.minimums.distance;
    
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
  private static calculateTimeFee(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    if (!request.duration) return;

    const vehicleConfig = this.PRICING_CONFIG.vehicles[request.vehicleType];
    const minimumMinutes = this.PRICING_CONFIG.services.minimums.time;
    
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
  private static calculateZoneFees(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    // Airport fees
    const pickupAirport = PricingHelpers.detectAirport(request.pickup);
    const dropoffAirport = PricingHelpers.detectAirport(request.dropoff);
    
    if (pickupAirport && this.PRICING_CONFIG.zones.airports[pickupAirport]) {
      const fee = this.PRICING_CONFIG.zones.airports[pickupAirport].fee;
      breakdown.airportFees += fee;
      breakdown.details.push({
        component: 'airport_pickup',
        amount: fee,
        description: `${pickupAirport} pickup fee`
      });
    }
    
    if (dropoffAirport && this.PRICING_CONFIG.zones.airports[dropoffAirport] && dropoffAirport !== pickupAirport) {
      const fee = this.PRICING_CONFIG.zones.airports[dropoffAirport].fee;
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
      if (this.PRICING_CONFIG.zones.congestion[zone]) {
        const fee = this.PRICING_CONFIG.zones.congestion[zone];
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
   * Calculate additional services
   */
  private static calculateAdditionalServices(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    // Multi-stop fee (if applicable)
    if (request.extras?.includes('multi_stop')) {
      const fee = this.PRICING_CONFIG.services.multiStop;
      breakdown.multiStopFees += fee;
      breakdown.details.push({
        component: 'multi_stop',
        amount: fee,
        description: 'Additional stop'
      });
    }

    // Other extras (simplified for now)
    const extraServices = request.extras?.filter(extra => extra !== 'multi_stop') || [];
    extraServices.forEach(extra => {
      let fee = 0;
      let description = '';
      
      switch (extra) {
        case 'child_seat':
          fee = 15;
          description = 'Child safety seat';
          break;
        case 'champagne':
          fee = 25;
          description = 'Champagne service';
          break;
        case 'meet_greet':
          fee = 20;
          description = 'Meet & greet service';
          break;
      }
      
      if (fee > 0) {
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
  private static applyMultipliers(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    const dateTime = new Date(request.dateTime);
    const timePeriod = PricingHelpers.getTimePeriod(dateTime);
    const multiplier = this.PRICING_CONFIG.multipliers.time[timePeriod];
    
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
  private static applyDiscounts(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    if (request.corporateTier) {
      let discountRate = 0;
      
      if (request.corporateTier === 'tier1') {
        discountRate = this.PRICING_CONFIG.policies.corporate.tier1;
      } else if (request.corporateTier === 'tier2') {
        discountRate = this.PRICING_CONFIG.policies.corporate.tier2;
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
  private static applyMinimumFare(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    const vehicleConfig = this.PRICING_CONFIG.vehicles[request.vehicleType];
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
   * Create success response
   */
  private static createSuccessResponse(breakdown: PricingBreakdownData): PricingResult {
    return {
      success: true,
      finalPrice: breakdown.finalPrice,
      currency: 'GBP',
      breakdown: {
        baseFare: breakdown.baseFare,
        distanceFee: breakdown.distanceFee,
        timeFee: breakdown.timeFee,
        additionalFees: breakdown.airportFees + breakdown.zoneFees + breakdown.tollFees,
        services: breakdown.extraServices + breakdown.multiStopFees + breakdown.waitingFees,
        subtotal: breakdown.subtotal,
        multipliers: breakdown.multipliers,
        discounts: breakdown.discounts,
        finalPrice: breakdown.finalPrice
      },
      details: breakdown.details,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create error response
   */
  private static createErrorResponse(message: string, code: number): PricingResult {
    return {
      success: false,
      error: message,
      code,
      timestamp: new Date().toISOString()
    };
  }
}

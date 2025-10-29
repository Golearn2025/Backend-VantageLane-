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
import { TollRoadDetector } from '../utils/TollRoadDetector';
import { GoogleMapsService } from './GoogleMapsService';

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

      // Step 1: Base fare (NOT for hourly bookings - hourly is flat rate per hour)
      if (request.bookingType !== BookingType.HOURLY) {
        this.calculateBaseFare(breakdown, request);
      }

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

      // Step 4: Zone fees (airports, congestion)
      this.calculateZoneFees(breakdown, request);

      // Step 4.5: Toll roads detection (async)
      await this.calculateTollFees(breakdown, request);

      // Step 5: Additional services (async - reads from Supabase)
      await this.calculateAdditionalServices(breakdown, request);

      // Step 6: Calculate subtotal
      breakdown.subtotal = breakdown.baseFare + breakdown.distanceFee + breakdown.timeFee + 
                          breakdown.airportFees + breakdown.zoneFees + breakdown.tollFees + 
                          breakdown.multiStopFees + breakdown.waitingFees + breakdown.extraServices;

      // Step 6.5: Apply RETURN trip logic (x2 with discount)
      if (request.bookingType === BookingType.RETURN) {
        this.applyReturnTripLogic(breakdown, request);
      }

      // Step 6.6: Apply FLEET logic (multiple vehicles)
      if (request.bookingType === BookingType.FLEET && request.fleetConfig) {
        this.applyFleetLogic(breakdown, request);
      }

      // Step 7: Apply multipliers
      this.applyMultipliers(breakdown, request);

      // Step 8: Apply discounts
      this.applyDiscounts(breakdown, request);

      // Step 9: Check minimum fare
      this.applyMinimumFare(breakdown, request);

      // Step 10: Apply rounding
      // Calculate final price BEFORE rounding: subtotal - discounts
      const priceBeforeRounding = breakdown.finalPrice || (breakdown.subtotal - breakdown.discounts);
      breakdown.finalPrice = PricingHelpers.applyRounding(
        priceBeforeRounding, 
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
    // Get hours from request (default to 3 if not provided)
    const requestedHours = request.hours || 3;
    
    // Get hourly settings from Supabase config (for min/max hours)
    const hourlySettings = (this.PRICING_CONFIG as any).hourly_settings || {
      minimum_hours: 3,
      maximum_hours: 12,
      distance_limit_per_hour: 15
    };
    
    // Apply min/max hours
    const billableHours = Math.min(
      Math.max(requestedHours, hourlySettings.minimum_hours),
      hourlySettings.maximum_hours
    );

    // Get hourly rate from vehicle config (in-town rate = first value)
    const vehicleConfig = this.PRICING_CONFIG.vehicles[request.vehicleType];
    const hourlyRate = Array.isArray(vehicleConfig.rates.hourly) 
      ? vehicleConfig.rates.hourly[0]  // Use in-town rate
      : vehicleConfig.rates.hourly;
    
    const hourlyFee = billableHours * hourlyRate;
    
    // Store in timeFee field for consistency
    breakdown.timeFee = hourlyFee;
    
    breakdown.details.push({
      component: 'hourly_fee',
      amount: hourlyFee,
      description: `${billableHours} hours at £${hourlyRate}/hr`
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
   * Calculate toll fees by detecting toll roads in route
   */
  private static async calculateTollFees(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    try {
      // Get detailed route from Google Maps
      const routeData = await GoogleMapsService.getDetailedRoute(request.pickup, request.dropoff);
      
      if (!routeData.success || !routeData.route) {
        // If route detection fails, skip toll fees
        return;
      }

      // Detect toll roads from route
      const tollRoads = TollRoadDetector.detectTollRoads(routeData.route);
      
      // Add toll fees
      tollRoads.forEach(tollCode => {
        const fee = TollRoadDetector.getTollFee(tollCode, this.PRICING_CONFIG);
        
        if (fee > 0) {
          breakdown.tollFees += fee;
          
          const tollNames: Record<string, string> = {
            'dartford': 'Dartford Crossing',
            'm6': 'M6 Toll'
          };
          
          breakdown.details.push({
            component: 'toll_fee',
            amount: fee,
            description: `${tollNames[tollCode] || tollCode} toll`
          });
        }
      });
    } catch (error) {
      console.error('Error calculating toll fees:', error);
      // Don't fail the whole pricing if toll detection fails
    }
  }

  /**
   * Apply RETURN trip logic: (subtotal × 2) - discount
   */
  private static applyReturnTripLogic(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    const returnSettings = (this.PRICING_CONFIG as any).return_settings || {
      discount_rate: 0.10,
      minimum_hours_between: 2
    };

    // Double the subtotal (outbound + return)
    const originalSubtotal = breakdown.subtotal;
    breakdown.subtotal = originalSubtotal * 2;

    // Apply return discount
    const discountAmount = breakdown.subtotal * returnSettings.discount_rate;
    breakdown.discounts += discountAmount;
    
    // Subtract discount from subtotal for return trips
    breakdown.subtotal -= discountAmount;

    breakdown.details.push({
      component: 'return_trip',
      amount: originalSubtotal,
      description: 'Return trip (outbound + return)'
    });

    breakdown.details.push({
      component: 'return_discount',
      amount: -discountAmount,
      description: `Return discount (${(returnSettings.discount_rate * 100).toFixed(0)}%)`
    });
  }

  /**
   * Apply FLEET logic: calculate for EACH vehicle type separately
   */
  private static applyFleetLogic(breakdown: PricingBreakdownData, request: PricingRequestData): void {
    if (!request.fleetConfig) return;

    const fleetSettings = (this.PRICING_CONFIG as any).fleet_settings || {
      discounts: {
        tier1: { min_vehicles: 3, discount_rate: 0.05 },
        tier2: { min_vehicles: 5, discount_rate: 0.10 }
      }
    };

    // Calculate total vehicles
    const totalVehicles = Object.values(request.fleetConfig).reduce((sum, count) => sum + count, 0);

    // Reset breakdown to recalculate for fleet
    let fleetTotal = 0;
    
    // Calculate price for EACH vehicle type
    for (const [vehicleType, count] of Object.entries(request.fleetConfig)) {
      if (count === 0) continue;
      
      const vType = vehicleType as VehicleType;
      const vehicleConfig = this.PRICING_CONFIG.vehicles[vType];
      
      // Calculate price for this vehicle type
      let vehiclePrice = 0;
      
      // Base fare
      const baseFare = Array.isArray(vehicleConfig.rates.base) 
        ? vehicleConfig.rates.base[0] 
        : vehicleConfig.rates.base;
      vehiclePrice += baseFare;
      
      // Distance fee
      if (request.distance) {
        const distanceFee = this.calculateDistanceFeeForVehicle(request.distance, vType);
        vehiclePrice += distanceFee;
      }
      
      // Time fee
      if (request.duration) {
        const perMinRate = vehicleConfig.rates.perMin;
        const timeFee = request.duration * perMinRate;
        vehiclePrice += timeFee;
      }
      
      // Airport fees (same for all vehicles)
      vehiclePrice += breakdown.airportFees / (breakdown.baseFare > 0 ? 1 : totalVehicles);
      
      // Zone fees (same for all vehicles)
      vehiclePrice += breakdown.zoneFees / (breakdown.baseFare > 0 ? 1 : totalVehicles);
      
      // Apply minimum fare for this vehicle type
      const minimumFare = vehicleConfig.rates.minimum;
      const finalPricePerVehicle = Math.max(vehiclePrice, minimumFare);
      
      // Total for this vehicle type
      const totalForType = finalPricePerVehicle * count;
      fleetTotal += totalForType;
      
      // Add detail for this vehicle type
      breakdown.details.push({
        component: 'fleet_vehicle',
        amount: totalForType,
        description: `${count} × ${vehicleConfig.name} @ £${finalPricePerVehicle.toFixed(2)} each`
      });
    }
    
    // Update subtotal with fleet total
    breakdown.subtotal = fleetTotal;

    // Apply fleet discount based on tier
    let discountRate = 0;
    if (totalVehicles >= fleetSettings.discounts.tier2.min_vehicles) {
      discountRate = fleetSettings.discounts.tier2.discount_rate;
    } else if (totalVehicles >= fleetSettings.discounts.tier1.min_vehicles) {
      discountRate = fleetSettings.discounts.tier1.discount_rate;
    }

    if (discountRate > 0) {
      const discountAmount = breakdown.subtotal * discountRate;
      breakdown.discounts += discountAmount;

      breakdown.details.push({
        component: 'fleet_discount',
        amount: -discountAmount,
        description: `Fleet discount (${totalVehicles} vehicles, ${(discountRate * 100).toFixed(0)}%)`
      });
    }

    breakdown.details.push({
      component: 'fleet_total',
      amount: fleetTotal,
      description: `Total for ${totalVehicles} vehicles`
    });
  }
  
  /**
   * Helper: Calculate distance fee for a specific vehicle type
   */
  private static calculateDistanceFeeForVehicle(distanceMiles: number, vehicleType: VehicleType): number {
    const vehicleConfig = this.PRICING_CONFIG.vehicles[vehicleType];
    const perMileRates = vehicleConfig.rates.perMile;
    
    // Tiered pricing: different rates for first 6 miles vs 6+ miles
    const tier1Miles = Math.min(distanceMiles, 6);
    const tier2Miles = Math.max(0, distanceMiles - 6);
    
    const tier1Rate = Array.isArray(perMileRates) ? perMileRates[0] : perMileRates;
    const tier2Rate = Array.isArray(perMileRates) ? perMileRates[1] : perMileRates;
    
    return (tier1Miles * tier1Rate) + (tier2Miles * tier2Rate);
  }

  /**
   * Calculate additional services using Supabase premium_services config
   */
  private static async calculateAdditionalServices(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
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

    // Get Supabase config for premium services
    const { PricingConfigService } = await import('./PricingConfigService');
    const { PricingConfigAdapter } = await import('./PricingConfigAdapter');
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

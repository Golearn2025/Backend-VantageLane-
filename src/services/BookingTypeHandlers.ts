/**
 * Booking Type Handlers - Return trip, Fleet logic, and Leg generation
 * Extracted from PricingEngine for modularity
 */

import { 
  PricingRequestData, 
  VehicleType,
  PricingBreakdownData,
  PricingConfig,
  LegBreakdown,
  FleetCategorySummary
} from '../types/pricing.types';
import { FeeCalculators } from './FeeCalculators';

export class BookingTypeHandlers {

  /**
   * Apply RETURN trip logic: (subtotal × 2) - discount
   */
  static applyReturnTripLogic(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    const returnSettings = config.return_settings || {
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
  static applyFleetLogic(breakdown: PricingBreakdownData, request: PricingRequestData, config: PricingConfig): void {
    if (!request.fleetConfig) return;

    const fleetSettings = config.fleet_settings || {
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
      const vehicleConfig = config.vehicles[vType];
      
      // Calculate price for this vehicle type
      let vehiclePrice = 0;
      
      // Base fare
      const baseFare = Array.isArray(vehicleConfig.rates.base) 
        ? vehicleConfig.rates.base[0] 
        : vehicleConfig.rates.base;
      vehiclePrice += baseFare;
      
      // Distance fee (request.distance is in km, convert to miles)
      if (request.distance) {
        const distanceInMiles = request.distance * 0.621371;
        const distanceFee = FeeCalculators.calculateDistanceFeeForVehicle(distanceInMiles, vType, config);
        vehiclePrice += distanceFee;
      }
      
      // Time fee
      if (request.duration) {
        const perMinRate = vehicleConfig.rates.perMin;
        const timeFee = request.duration * perMinRate;
        vehiclePrice += timeFee;
      }
      
      // Airport fees (split equally among all vehicles)
      vehiclePrice += breakdown.airportFees / totalVehicles;
      
      // Zone fees (split equally among all vehicles)
      vehiclePrice += breakdown.zoneFees / totalVehicles;
      
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
      breakdown.subtotal -= discountAmount;

      breakdown.details.push({
        component: 'fleet_discount',
        amount: -discountAmount,
        description: `Fleet discount (${totalVehicles} vehicles, ${(discountRate * 100).toFixed(0)}%)`
      });
    }

    breakdown.details.push({
      component: 'fleet_total',
      amount: breakdown.subtotal,
      description: `Total for ${totalVehicles} vehicles (after discount)`
    });
  }

  /**
   * Generate legs breakdown for RETURN bookings
   */
  static generateReturnLegs(breakdown: PricingBreakdownData, request: PricingRequestData): LegBreakdown[] {
    // Calculate price per leg (after discount split)
    const pricePerLeg = breakdown.finalPrice / 2;
    
    // Platform commission (default 10%)
    const platformPct = 0.10;
    const driverPct = 0.20;
    
    const platformFeePerLeg = pricePerLeg * platformPct;
    const operatorNetPerLeg = pricePerLeg - platformFeePerLeg;
    const driverPayoutPerLeg = operatorNetPerLeg * (1 - driverPct);

    // Base pricing per leg (before discount)
    const basePricing = {
      baseFare: breakdown.baseFare,
      distanceFee: breakdown.distanceFee,
      timeFee: breakdown.timeFee,
      airportFees: breakdown.airportFees,
      zoneFees: breakdown.zoneFees,
      tollFees: breakdown.tollFees,
      extraServices: breakdown.extraServices / 2, // Split services
      subtotal: breakdown.baseFare + breakdown.distanceFee + breakdown.timeFee + 
                breakdown.airportFees + breakdown.zoneFees + breakdown.tollFees,
      leg_price: pricePerLeg
    };

    return [
      {
        leg_number: 1,
        leg_type: 'outbound',
        pickup_location: request.pickup,
        destination: request.dropoff,
        scheduled_at: request.dateTime,
        distance_miles: request.distance,
        duration_min: request.duration,
        pricing: basePricing,
        platform_fee: Number(platformFeePerLeg.toFixed(2)),
        operator_net: Number(operatorNetPerLeg.toFixed(2)),
        driver_payout: Number(driverPayoutPerLeg.toFixed(2))
      },
      {
        leg_number: 2,
        leg_type: 'return',
        pickup_location: request.dropoff,
        destination: request.pickup,
        // Return scheduled time would come from request if available
        distance_miles: request.distance,
        duration_min: request.duration,
        pricing: basePricing,
        platform_fee: Number(platformFeePerLeg.toFixed(2)),
        operator_net: Number(operatorNetPerLeg.toFixed(2)),
        driver_payout: Number(driverPayoutPerLeg.toFixed(2))
      }
    ];
  }

  /**
   * Generate legs breakdown for FLEET bookings
   */
  static generateFleetLegs(
    breakdown: PricingBreakdownData, 
    request: PricingRequestData,
    config: PricingConfig
  ): { legs: LegBreakdown[]; summary: FleetCategorySummary[] } {
    const legs: LegBreakdown[] = [];
    const summary: FleetCategorySummary[] = [];
    
    const platformPct = 0.10;
    const driverPct = 0.20;
    
    let legNumber = 1;
    
    // Map vehicle types to categories
    const vehicleMap: Record<string, string> = {
      'executive': 'EXEC',
      'luxury': 'LUX',
      'van': 'VAN',
      'suv': 'SUV'
    };

    // Process each vehicle type in fleet
    for (const [fleetKey, count] of Object.entries(request.fleetConfig || {})) {
      if (count === 0) continue;
      
      const category = vehicleMap[fleetKey] || 'EXEC';
      const vehicleType = this.getVehicleTypeFromCategory(category);
      const vehicleConfig = config.vehicles[vehicleType];
      
      // Calculate price per vehicle of this type
      let vehiclePrice = 0;
      
      // Base fare
      const baseFare = Array.isArray(vehicleConfig.rates.base) 
        ? vehicleConfig.rates.base[0] 
        : vehicleConfig.rates.base;
      vehiclePrice += baseFare;
      
      // Distance fee (request.distance is in km, convert to miles)
      const distanceInMiles = request.distance ? request.distance * 0.621371 : 0;
      if (request.distance) {
        const distanceFee = FeeCalculators.calculateDistanceFeeForVehicle(distanceInMiles, vehicleType, config);
        vehiclePrice += distanceFee;
      }
      
      // Time fee
      if (request.duration) {
        const timeFee = request.duration * vehicleConfig.rates.perMin;
        vehiclePrice += timeFee;
      }
      
      // Airport fees (split among all vehicles)
      const totalVehicles = Object.values(request.fleetConfig || {}).reduce((sum, c) => sum + c, 0);
      const airportFeePerVehicle = breakdown.airportFees / totalVehicles;
      const zoneFeePerVehicle = breakdown.zoneFees / totalVehicles;
      
      vehiclePrice += airportFeePerVehicle + zoneFeePerVehicle;
      
      // Apply minimum fare
      const minimumFare = vehicleConfig.rates.minimum;
      const finalPricePerVehicle = Math.max(vehiclePrice, minimumFare);
      
      // Calculate commissions
      const platformFee = finalPricePerVehicle * platformPct;
      const operatorNet = finalPricePerVehicle - platformFee;
      const driverPayout = operatorNet * (1 - driverPct);
      
      // Create legs for each vehicle of this type
      for (let i = 1; i <= count; i++) {
        legs.push({
          leg_number: legNumber++,
          leg_type: 'vehicle',
          vehicle_category: category,
          vehicle_index: i,
          pickup_location: request.pickup,
          destination: request.dropoff,
          scheduled_at: request.dateTime,
          distance_miles: request.distance,
          duration_min: request.duration,
          pricing: {
            baseFare,
            distanceFee: request.distance ? FeeCalculators.calculateDistanceFeeForVehicle(distanceInMiles, vehicleType, config) : 0,
            timeFee: request.duration ? request.duration * vehicleConfig.rates.perMin : 0,
            airportFees: airportFeePerVehicle,
            zoneFees: zoneFeePerVehicle,
            tollFees: 0,
            extraServices: 0,
            subtotal: vehiclePrice,
            leg_price: finalPricePerVehicle
          },
          platform_fee: Number(platformFee.toFixed(2)),
          operator_net: Number(operatorNet.toFixed(2)),
          driver_payout: Number(driverPayout.toFixed(2))
        });
      }
      
      // Add to summary
      summary.push({
        category,
        count,
        unit_price: Number(finalPricePerVehicle.toFixed(2)),
        total: Number((finalPricePerVehicle * count).toFixed(2))
      });
    }
    
    return { legs, summary };
  }

  /**
   * Helper: Get VehicleType from category string
   */
  private static getVehicleTypeFromCategory(category: string): VehicleType {
    const map: Record<string, VehicleType> = {
      'EXEC': VehicleType.EXECUTIVE,
      'LUX': VehicleType.LUXURY,
      'SUV': VehicleType.SUV,
      'VAN': VehicleType.VAN
    };
    return map[category] || VehicleType.EXECUTIVE;
  }
}

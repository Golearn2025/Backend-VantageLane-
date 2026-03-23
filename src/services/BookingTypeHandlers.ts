/**
 * Booking Type Handlers - Refactored to use database views
 * 
 * CHANGES FROM OLD VERSION:
 * - Removed dependency on PricingConfig JSONB
 * - Now reads from normalized database views via PricingDataService
 * - All methods are now async
 */

import {
  PricingRequestData,
  PricingBreakdownData,
  VehicleType,
  BookingType,
  LegBreakdown,
  FleetCategorySummary
} from '../types/pricing.types';
import { FeeCalculators } from './FeeCalculators';
import { PricingDataService } from './PricingDataService';

export class BookingTypeHandlers {

  /**
   * Apply RETURN trip logic: (subtotal × 2) - discount
   * Reads from: v_active_pricing_version (return_discount_rate)
   */
  static async applyReturnTripLogic(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    const returnSettings = await PricingDataService.getReturnSettings();

    // Double the subtotal for round trip
    breakdown.subtotal = breakdown.subtotal * 2;

    // Apply return discount
    const discountAmount = breakdown.subtotal * returnSettings.discount_rate;
    breakdown.discounts += discountAmount;
    breakdown.subtotal -= discountAmount;

    breakdown.details.push({
      component: 'return_discount',
      amount: -discountAmount,
      description: `Return trip discount (${(returnSettings.discount_rate * 100).toFixed(0)}%)`
    });
  }

  /**
   * Apply FLEET logic: Calculate price per vehicle type, apply tier discounts
   * Reads from: v_pricing_vehicle_rates, v_active_pricing_version (fleet settings)
   */
  static async applyFleetLogic(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (!request.fleetConfig) return;

    const fleetSettings = await PricingDataService.getFleetSettings();

    // Calculate total number of vehicles
    const totalVehicles = Object.values(request.fleetConfig).reduce((sum, count) => sum + count, 0);

    let fleetSubtotal = 0;
    const vehicleBreakdowns: any[] = [];

    // Calculate price for each vehicle type
    for (const [vehicleType, count] of Object.entries(request.fleetConfig)) {
      if (count === 0) continue;

      const vType = vehicleType as VehicleType;
      const rates = await PricingDataService.getVehicleRates(vType, 'one_way');

      // Calculate price for this vehicle type
      let vehiclePrice = 0;

      // Base fare
      vehiclePrice += PricingDataService.penceToPounds(rates.base_fare_pence);

      // Distance fee (if provided)
      if (request.distance) {
        const distanceInMiles = request.distance * 0.621371;
        vehiclePrice += await FeeCalculators.calculateDistanceFeeForVehicle(
          distanceInMiles,
          vType,
          BookingType.ONE_WAY
        );
      }

      // Time fee (if provided)
      if (request.duration) {
        const perMinRate = PricingDataService.penceToPounds(rates.per_minute_pence);
        vehiclePrice += request.duration * perMinRate;
      }

      // Apply minimum fare
      const minimumFare = PricingDataService.penceToPounds(rates.minimum_fare_pence);
      vehiclePrice = Math.max(vehiclePrice, minimumFare);

      // Total for all vehicles of this type
      const totalForType = vehiclePrice * count;
      fleetSubtotal += totalForType;

      vehicleBreakdowns.push({
        vehicleType: vType,
        count: count,
        pricePerVehicle: vehiclePrice,
        totalForType: totalForType
      });

      breakdown.details.push({
        component: 'fleet_vehicle',
        amount: totalForType,
        description: `${count} × ${vType} @ £${vehiclePrice.toFixed(2)} each`
      });
    }

    // Apply fleet tier discount
    let fleetDiscount = 0;
    const tier2 = fleetSettings.discounts.tier2;
    const tier1 = fleetSettings.discounts.tier1;

    if (totalVehicles >= tier2.min_vehicles) {
      fleetDiscount = fleetSubtotal * tier2.discount_rate;
      breakdown.details.push({
        component: 'fleet_discount',
        amount: -fleetDiscount,
        description: `Fleet discount (${totalVehicles} vehicles, ${(tier2.discount_rate * 100).toFixed(0)}%)`
      });
    } else if (totalVehicles >= tier1.min_vehicles) {
      fleetDiscount = fleetSubtotal * tier1.discount_rate;
      breakdown.details.push({
        component: 'fleet_discount',
        amount: -fleetDiscount,
        description: `Fleet discount (${totalVehicles} vehicles, ${(tier1.discount_rate * 100).toFixed(0)}%)`
      });
    }

    breakdown.subtotal = fleetSubtotal - fleetDiscount;
    breakdown.discounts += fleetDiscount;
  }

  /**
   * Generate legs breakdown for RETURN bookings
   */
  static async generateReturnLegs(
    breakdown: PricingBreakdownData,
    request: PricingRequestData,
    finalPrice: number
  ): Promise<{ legs: LegBreakdown[] }> {
    // Platform and operator commission rates (default 10% each)
    const platformRate = 0.10;
    const operatorRate = 0.10;

    const pricePerLeg = finalPrice / 2;

    // Outbound leg
    const outboundLeg: LegBreakdown = {
      leg_number: 1,
      leg_type: 'outbound',
      pickup_location: request.pickup,
      destination: request.dropoff,
      scheduled_at: request.dateTime,
      distance_miles: request.distance ? request.distance * 0.621371 : undefined,
      duration_min: request.duration,
      pricing: {
        baseFare: breakdown.baseFare / 2,
        distanceFee: breakdown.distanceFee / 2,
        timeFee: breakdown.timeFee / 2,
        airportFees: breakdown.airportFees / 2,
        zoneFees: breakdown.zoneFees / 2,
        tollFees: breakdown.tollFees / 2,
        serviceItemFees: breakdown.serviceItemFees / 2,
        subtotal: breakdown.subtotal / 2,
        leg_price: pricePerLeg
      },
      platform_fee: pricePerLeg * platformRate,
      operator_net: pricePerLeg * (1 - platformRate),
      driver_payout: pricePerLeg * (1 - platformRate) * (1 - operatorRate)
    };

    // Return leg
    const returnLeg: LegBreakdown = {
      leg_number: 2,
      leg_type: 'return',
      pickup_location: request.dropoff,
      destination: request.pickup,
      scheduled_at: request.dateTime, // Would be adjusted for actual return time
      distance_miles: request.distance ? request.distance * 0.621371 : undefined,
      duration_min: request.duration,
      pricing: {
        baseFare: breakdown.baseFare / 2,
        distanceFee: breakdown.distanceFee / 2,
        timeFee: breakdown.timeFee / 2,
        airportFees: breakdown.airportFees / 2,
        zoneFees: breakdown.zoneFees / 2,
        tollFees: breakdown.tollFees / 2,
        serviceItemFees: breakdown.serviceItemFees / 2,
        subtotal: breakdown.subtotal / 2,
        leg_price: pricePerLeg
      },
      platform_fee: pricePerLeg * platformRate,
      operator_net: pricePerLeg * (1 - platformRate),
      driver_payout: pricePerLeg * (1 - platformRate) * (1 - operatorRate)
    };

    return { legs: [outboundLeg, returnLeg] };
  }

  /**
   * Generate legs breakdown for FLEET bookings
   */
  static async generateFleetLegs(
    breakdown: PricingBreakdownData,
    request: PricingRequestData,
    finalPrice: number
  ): Promise<{ legs: LegBreakdown[]; summary: FleetCategorySummary[] }> {
    if (!request.fleetConfig) {
      return { legs: [], summary: [] };
    }

    const platformRate = 0.10;
    const operatorRate = 0.10;

    const legs: LegBreakdown[] = [];
    const summary: FleetCategorySummary[] = [];

    let legNumber = 1;

    // Vehicle category mapping
    const vehicleMap: Record<string, string> = {
      'executive': 'EXEC',
      'luxury': 'LUX',
      'suv': 'SUV',
      'van': 'VAN'
    };

    for (const [fleetKey, count] of Object.entries(request.fleetConfig)) {
      if (count === 0) continue;

      const category = vehicleMap[fleetKey] || 'EXEC';
      const vehicleType = this.getVehicleTypeFromCategory(category);
      const rates = await PricingDataService.getVehicleRates(vehicleType, 'one_way');

      // Calculate price per vehicle of this type
      let vehiclePrice = PricingDataService.penceToPounds(rates.base_fare_pence);

      if (request.distance) {
        const distanceInMiles = request.distance * 0.621371;
        vehiclePrice += await FeeCalculators.calculateDistanceFeeForVehicle(
          distanceInMiles,
          vehicleType,
          BookingType.ONE_WAY
        );
      }

      if (request.duration) {
        const perMinRate = PricingDataService.penceToPounds(rates.per_minute_pence);
        vehiclePrice += request.duration * perMinRate;
      }

      const minimumFare = PricingDataService.penceToPounds(rates.minimum_fare_pence);
      vehiclePrice = Math.max(vehiclePrice, minimumFare);

      // Create legs for each vehicle
      for (let i = 1; i <= count; i++) {
        const leg: LegBreakdown = {
          leg_number: legNumber++,
          leg_type: 'vehicle',
          vehicle_category: category,
          vehicle_index: i,
          pickup_location: request.pickup,
          destination: request.dropoff,
          scheduled_at: request.dateTime,
          distance_miles: request.distance ? request.distance * 0.621371 : undefined,
          duration_min: request.duration,
          pricing: {
            baseFare: PricingDataService.penceToPounds(rates.base_fare_pence),
            distanceFee: request.distance ? await FeeCalculators.calculateDistanceFeeForVehicle(
              request.distance * 0.621371,
              vehicleType,
              BookingType.ONE_WAY
            ) : 0,
            timeFee: request.duration ? request.duration * PricingDataService.penceToPounds(rates.per_minute_pence) : 0,
            airportFees: 0, // Split proportionally if needed
            zoneFees: 0,
            tollFees: 0,
            serviceItemFees: 0,
            subtotal: vehiclePrice,
            leg_price: vehiclePrice
          },
          platform_fee: vehiclePrice * platformRate,
          operator_net: vehiclePrice * (1 - platformRate),
          driver_payout: vehiclePrice * (1 - platformRate) * (1 - operatorRate)
        };

        legs.push(leg);
      }

      // Add to summary
      summary.push({
        category: category,
        count: count,
        unit_price: vehiclePrice,
        total: vehiclePrice * count
      });
    }

    return { legs, summary };
  }

  /**
   * Helper: Convert category to VehicleType
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

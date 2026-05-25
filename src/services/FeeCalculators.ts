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
  BookingType,
  PricingBreakdownData,
  PricingRequestData,
  VehicleType
} from '../types/pricing.types';
import { PricingHelpers, type TimePeriodConfig } from '../utils/PricingHelpers';
import { PricingDataService } from './PricingDataService';
import { detectCongestionChargeTouch } from './CongestionZoneService';

export class FeeCalculators {

  /**
   * Calculate base fare
   * Reads from: v_pricing_vehicle_rates
   */
  static async calculateBaseFare(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (!request.vehicleType) {
      throw new Error('Vehicle type is required for base fare calculation');
    }
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
      description: `${rates.vehicle_category_id ?? request.vehicleType} base fare`
    });
  }

  /**
   * Calculate hourly fee for hourly bookings
   * Reads from: v_pricing_hourly_rules
   */
  static async calculateHourlyFee(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (!request.vehicleType) {
      throw new Error('Vehicle type is required for hourly fee calculation');
    }
    const requestedHours = request.hours || 3;

    const hourlyRules = await PricingDataService.getHourlyRules(request.vehicleType, request.organizationId);
    const rates = await PricingDataService.getVehicleRates(
      request.vehicleType,
      request.bookingType,
      request.organizationId
    );

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
    if (!request.vehicleType) {
      throw new Error('Vehicle type is required for daily fee calculation');
    }
    const requestedDays = request.days || 1;

    const dailyRules = await PricingDataService.getDailyRules(request.vehicleType, request.organizationId);
    const rates = await PricingDataService.getVehicleRates(
      request.vehicleType,
      request.bookingType,
      request.organizationId
    );

    // Daily rules: duration bounds (minimum_days / maximum_days) + package copy (included_hours)
    const minimumDays = Number(dailyRules.minimum_days) > 0 ? Number(dailyRules.minimum_days) : 1;
    const maximumDays =
      Number(dailyRules.maximum_days) >= minimumDays ? Number(dailyRules.maximum_days) : minimumDays;

    const billableDays = Math.min(Math.max(requestedDays, minimumDays), maximumDays);

    // Convert pence to pounds
    const dailyRate = PricingDataService.penceToPounds(rates.daily_rate_pence);
    const dailyFee = billableDays * dailyRate;

    breakdown.timeFee = dailyFee;

    const durationNote =
      billableDays !== requestedDays
        ? ` (requested ${requestedDays}, billed ${billableDays}; min ${minimumDays} / max ${maximumDays} days)`
        : '';

    breakdown.details.push({
      component: 'daily_fee',
      amount: dailyFee,
      description: `${billableDays} days at £${dailyRate}/day (${dailyRules.included_hours}hrs included)${durationNote}`
    });
  }

  /**
   * Calculate distance fee (tiered pricing)
   * Reads from: v_pricing_vehicle_rates
   */
  static async calculateDistanceFee(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (!request.distance) return;
    if (!request.vehicleType) {
      throw new Error('Vehicle type is required for distance fee calculation');
    }

    const distanceMiles = request.distance * 0.621371; // Convert km to miles

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
    if (!request.vehicleType) {
      throw new Error('Vehicle type is required for time fee calculation');
    }

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
    const pickupAddress = typeof request.pickup === 'string' ? request.pickup : request.pickup?.address || '';
    const dropoffAddress = typeof request.dropoff === 'string' ? request.dropoff : request.dropoff?.address || '';

    // Airport fees — pickup_fee / dropoff_fee from v_pricing_airport_fees (Admin)
    const pickupAirport = PricingHelpers.detectAirport(pickupAddress);
    const dropoffAirport = PricingHelpers.detectAirport(dropoffAddress);

    if (pickupAirport) {
      const airportFee = await PricingDataService.getAirportFee(pickupAirport);
      if (airportFee?.pickup_fee_pence) {
        const fee = PricingDataService.penceToPounds(airportFee.pickup_fee_pence);
        breakdown.airportFees += fee;
        breakdown.details.push({
          component: 'airport_pickup',
          amount: fee,
          description: `${pickupAirport} airport pickup fee`,
        });
      }
    }

    if (dropoffAirport) {
      const airportFee = await PricingDataService.getAirportFee(dropoffAirport);
      const dropoffPence =
        airportFee?.dropoff_fee_pence ?? airportFee?.pickup_fee_pence ?? 0;
      if (dropoffPence > 0) {
        const fee = PricingDataService.penceToPounds(dropoffPence);
        breakdown.airportFees += fee;
        breakdown.details.push({
          component: 'airport_dropoff',
          amount: fee,
          description: `${dropoffAirport} airport dropoff fee`,
        });
      }
    }

    // Congestion Charge only — point-in-polygon on lat/lng (no ULEZ/LEZ)
    const ccTouch = detectCongestionChargeTouch(request.pickup, request.dropoff);
    if (ccTouch) {
      const zoneFee = await PricingDataService.getZoneFee('CONGESTION');
      const feePence = zoneFee?.fee_pence ?? 0;
      if (feePence > 0) {
        const fee = PricingDataService.penceToPounds(feePence);
        breakdown.zoneFees += fee;
        const where =
          ccTouch === 'both'
            ? 'pickup and dropoff in congestion zone'
            : ccTouch === 'pickup'
              ? 'pickup in congestion zone'
              : 'dropoff in congestion zone';
        breakdown.details.push({
          component: 'congestion_charge',
          amount: fee,
          description: `Congestion charge (${where})`,
        });
      }
    }
  }

  /**
   * Calculate toll fees
   * Reads from: v_pricing_zone_fees (tolls are stored as zone_type='toll')
   */
  static async calculateTollFees(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    // Extract address strings from TripPointInput objects
    const pickupAddress = typeof request.pickup === 'string' ? request.pickup : request.pickup?.address || '';
    const dropoffAddress = typeof request.dropoff === 'string' ? request.dropoff : request.dropoff?.address || '';

    // Detect toll roads from addresses (keyword-based)
    const addresses = [pickupAddress.toLowerCase(), dropoffAddress.toLowerCase()];
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
   * Reads from: v_active_pricing_version (multi-stop fee), service_items (premium services)
   */
  static async calculateAdditionalServices(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    // Multi-stop fee (legacy)
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

    // Premium services from service_items table
    const otherExtras = request.extras?.filter(e => e !== 'multi_stop') || [];
    if (otherExtras.length > 0) {
      try {
        const serviceItems = await PricingDataService.getServiceItemsByIds(
          otherExtras,
          request.organizationId
        );

        for (const item of serviceItems) {
          const price = PricingDataService.penceToPounds(item.price_pence || 0);
          breakdown.serviceItemFees += price;
          breakdown.details.push({
            component: 'service_item',
            amount: price,
            description: `${item.name || item.id} (${item.id})`
          });
        }
      } catch (error) {
        console.error('Failed to load service items:', error);
        // Don't fail entire pricing, just log and continue
      }
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

    // Build time period config from rules (London wall-clock matching)
    const timePeriodConfig: Record<string, { start?: string; end?: string; days?: number[] }> = {};
    timeRules.forEach(rule => {
      if (rule.start_time && rule.end_time) {
        timePeriodConfig[rule.rule_name] = {
          start: rule.start_time,
          end: rule.end_time,
          days: rule.day_of_week !== null ? [rule.day_of_week] : [0, 1, 2, 3, 4, 5, 6],
        };
      } else if (rule.rule_name === 'weekend') {
        timePeriodConfig[rule.rule_name] = {
          days: rule.day_of_week !== null ? [rule.day_of_week] : [0, 6],
        };
      } else {
        timePeriodConfig[rule.rule_name] = {
          days: rule.day_of_week !== null ? [rule.day_of_week] : [],
        };
      }
    });

    const best = PricingHelpers.resolveBestTimeMultiplier(
      dateTime,
      timeRules,
      timePeriodConfig as TimePeriodConfig
    );

    if (best && best.multiplier !== 1.0) {
      const multiplierAmount = breakdown.subtotal * (best.multiplier - 1);
      breakdown.multipliers[best.period] = best.multiplier;
      breakdown.subtotal += multiplierAmount;

      breakdown.details.push({
        component: 'time_multiplier',
        amount: multiplierAmount,
        description: `${best.period} multiplier (${best.multiplier}x)`,
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
        breakdown.discounts.total += discountAmount;

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
   * @deprecated Use applyMinimumFareToFinal instead (checks finalPrice after discounts)
   */
  static async applyMinimumFare(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (!request.vehicleType) {
      throw new Error('Vehicle type is required for minimum fare calculation');
    }
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
   * Transport subtotal before paid service_item fees (flori, upgrades).
   * Minimum fare applies only to this amount.
   */
  static sumTransportSubtotal(breakdown: PricingBreakdownData): number {
    return (
      breakdown.baseFare +
      breakdown.distanceFee +
      breakdown.timeFee +
      breakdown.multiStopFees +
      breakdown.airportFees +
      breakdown.zoneFees +
      breakdown.tollFees +
      breakdown.waitingFees
    );
  }

  /**
   * Multipliers, discounts, and minimum fare on transport only; then add service_item_fees.
   *
   * Order: vehicle components → multipliers → discounts → minimum → + service items → finalPrice/subtotal
   */
  static async finalizeTransportThenServiceItems(
    breakdown: PricingBreakdownData,
    request: PricingRequestData
  ): Promise<void> {
    const serviceItemFees = breakdown.serviceItemFees;

    breakdown.subtotal = this.sumTransportSubtotal(breakdown);
    await this.applyMultipliers(breakdown, request);
    await this.applyDiscounts(breakdown, request);
    breakdown.finalPrice = breakdown.subtotal - breakdown.discounts.total;
    await this.applyMinimumFareToFinal(breakdown, request);

    const transportFinal = breakdown.finalPrice;
    breakdown.serviceItemFees = serviceItemFees;
    breakdown.subtotal = transportFinal + serviceItemFees;
    breakdown.finalPrice = breakdown.subtotal;
  }

  /**
   * Apply minimum fare to finalPrice (after discounts).
   * Skips silently if minimum_fare_pence is null/0 in DB.
   *
   * Called AFTER: calculateBaseFare → distance/time fees → multipliers → discounts → finalPrice
   */
  static async applyMinimumFareToFinal(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
    if (!request.vehicleType) return;

    const rates = await PricingDataService.getVehicleRates(
      request.vehicleType,
      request.bookingType,
      request.organizationId
    );

    // Skip if no minimum configured
    if (!rates.minimum_fare_pence) return;

    const minimumFare = PricingDataService.penceToPounds(rates.minimum_fare_pence);
    if (!minimumFare || minimumFare <= 0) return;

    if (breakdown.finalPrice < minimumFare) {
      const adjustment = minimumFare - breakdown.finalPrice;
      breakdown.finalPrice = minimumFare;

      breakdown.details.push({
        component: 'minimum_fare',
        amount: adjustment,
        description: `Minimum fare applied (£${minimumFare.toFixed(2)} minimum)`
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

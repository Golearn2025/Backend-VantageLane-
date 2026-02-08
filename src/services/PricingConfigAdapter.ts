/**
 * Pricing Config Adapter
 * Converts Supabase pricing_config format to PricingEngine format
 */

import { PricingConfig, VehicleType, TimePeriod } from '../types/pricing.types';
import { PricingConfigRow } from './PricingConfigService';

export class PricingConfigAdapter {
  
  /**
   * Convert Supabase pricing_config to PricingEngine format
   */
  static toPricingConfig(dbConfig: PricingConfigRow): PricingConfig {
    return {
      vehicles: {
        [VehicleType.EXECUTIVE]: {
          name: dbConfig.vehicle_types.executive.name,
          rates: {
            base: dbConfig.vehicle_types.executive.base_fare,
            perMile: [
              dbConfig.vehicle_types.executive.per_mile_first_6,
              dbConfig.vehicle_types.executive.per_mile_after_6
            ],
            perMin: dbConfig.vehicle_types.executive.per_minute,
            hourly: [
              dbConfig.vehicle_types.executive.hourly_in_town,
              dbConfig.vehicle_types.executive.hourly_out_town
            ],
            minimum: dbConfig.vehicle_types.executive.minimum_fare
          }
        },
        [VehicleType.LUXURY]: {
          name: dbConfig.vehicle_types.luxury.name,
          rates: {
            base: dbConfig.vehicle_types.luxury.base_fare,
            perMile: [
              dbConfig.vehicle_types.luxury.per_mile_first_6,
              dbConfig.vehicle_types.luxury.per_mile_after_6
            ],
            perMin: dbConfig.vehicle_types.luxury.per_minute,
            hourly: [
              dbConfig.vehicle_types.luxury.hourly_in_town,
              dbConfig.vehicle_types.luxury.hourly_out_town
            ],
            minimum: dbConfig.vehicle_types.luxury.minimum_fare
          }
        },
        [VehicleType.SUV]: {
          name: dbConfig.vehicle_types.suv.name,
          rates: {
            base: dbConfig.vehicle_types.suv.base_fare,
            perMile: [
              dbConfig.vehicle_types.suv.per_mile_first_6,
              dbConfig.vehicle_types.suv.per_mile_after_6
            ],
            perMin: dbConfig.vehicle_types.suv.per_minute,
            hourly: [
              dbConfig.vehicle_types.suv.hourly_in_town,
              dbConfig.vehicle_types.suv.hourly_out_town
            ],
            minimum: dbConfig.vehicle_types.suv.minimum_fare
          }
        },
        [VehicleType.VAN]: {
          name: dbConfig.vehicle_types.van.name,
          rates: {
            base: dbConfig.vehicle_types.van.base_fare,
            perMile: [
              dbConfig.vehicle_types.van.per_mile_first_6,
              dbConfig.vehicle_types.van.per_mile_after_6
            ],
            perMin: dbConfig.vehicle_types.van.per_minute,
            hourly: [
              dbConfig.vehicle_types.van.hourly_in_town,
              dbConfig.vehicle_types.van.hourly_out_town
            ],
            minimum: dbConfig.vehicle_types.van.minimum_fare
          }
        }
      },
      
      multipliers: {
        time: {
          [TimePeriod.DAY]: dbConfig.time_multipliers.day.value,
          [TimePeriod.NIGHT]: dbConfig.time_multipliers.night.value,
          [TimePeriod.PEAK_MORNING]: dbConfig.time_multipliers.peak_morning.value,
          [TimePeriod.PEAK_EVENING]: dbConfig.time_multipliers.peak_evening.value,
          [TimePeriod.WEEKEND]: dbConfig.time_multipliers.weekend.value
        },
        events: {
          christmas: dbConfig.event_multipliers.christmas.value,
          newYear: dbConfig.event_multipliers.new_year.value,
          wimbledon: dbConfig.event_multipliers.wimbledon.value,
          default: 1.0
        }
      },
      
      zones: {
        airports: {
          LHR: {
            fee: dbConfig.airport_fees.LHR.pickup_fee,
            wait: dbConfig.airport_fees.LHR.free_wait_minutes
          },
          LGW: {
            fee: dbConfig.airport_fees.LGW.pickup_fee,
            wait: dbConfig.airport_fees.LGW.free_wait_minutes
          },
          STN: {
            fee: dbConfig.airport_fees.STN.pickup_fee,
            wait: dbConfig.airport_fees.STN.free_wait_minutes
          },
          LTN: {
            fee: dbConfig.airport_fees.LTN.pickup_fee,
            wait: dbConfig.airport_fees.LTN.free_wait_minutes
          },
          LCY: {
            fee: dbConfig.airport_fees.LCY.pickup_fee,
            wait: dbConfig.airport_fees.LCY.free_wait_minutes
          }
        },
        congestion: {
          central: dbConfig.zone_fees.central_london.fee,
          ulez: dbConfig.zone_fees.ulez.fee,
          lez: dbConfig.zone_fees.lez.fee
        },
        tolls: {
          dartford: dbConfig.zone_fees.dartford.fee,
          m6: dbConfig.zone_fees.m6.fee
        }
      },
      
      services: {
        multiStop: dbConfig.service_policies.multi_stop_fee,
        waitingRate: dbConfig.service_policies.waiting_rate_per_hour,
        freeWaiting: {
          normal: dbConfig.service_policies.free_waiting_normal_minutes,
          airport: dbConfig.service_policies.free_waiting_airport_minutes
        },
        minimums: {
          distance: dbConfig.service_policies.minimum_distance_miles,
          time: dbConfig.service_policies.minimum_time_minutes
        }
      },
      
      policies: {
        rounding: {
          to: dbConfig.general_policies.rounding.to,
          direction: dbConfig.general_policies.rounding.direction
        },
        cancellation: {
          freeHours: dbConfig.general_policies.cancellation.free_hours,
          chargeRate: dbConfig.general_policies.cancellation.charge_rate
        },
        corporate: {
          tier1: dbConfig.general_policies.corporate_discounts.tier1,
          tier2: dbConfig.general_policies.corporate_discounts.tier2
        }
      },
      
      premiumServices: dbConfig.premium_services || {},
      
      // Pass through booking type settings from Supabase
      hourly_settings: (dbConfig as any).hourly_settings || undefined,
      daily_settings: (dbConfig as any).daily_settings || undefined,
      return_settings: (dbConfig as any).return_settings || undefined,
      fleet_settings: (dbConfig as any).fleet_settings || undefined,
      time_period_config: (dbConfig as any).time_period_config || undefined
    };
  }
  
  /**
   * Get premium service price from Supabase config
   */
  static getPremiumServicePrice(dbConfig: PricingConfigRow, serviceCode: string): number {
    const services = dbConfig.premium_services || {};
    
    // Map service codes to Supabase structure
    switch (serviceCode) {
      case 'champagne':
      case 'champagne_premium':
        return services.champagne?.premium?.price || 120;
      case 'champagne_exclusive':
        return services.champagne?.exclusive?.price || 350;
      case 'flowers':
      case 'flowers_standard':
      case 'fresh_flowers':
        return services.flowers?.standard?.price || 120;
      case 'flowers_premium':
        return services.flowers?.premium?.price || 250;
      case 'security':
      case 'security_escort':
        return services.security?.professional?.price || 750;
      case 'child_seat':
        return services.child_seat?.standard?.price || 15;
      case 'meet_greet':
      case 'meet_and_greet':
        return services.meet_greet?.standard?.price || 20;
      default:
        return 0;
    }
  }
}

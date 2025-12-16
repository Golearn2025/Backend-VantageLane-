/**
 * TypeScript interfaces and types for pricing system
 * Strict typing for professional development
 */

export enum VehicleType {
  EXECUTIVE = 'executive',
  LUXURY = 'luxury',
  SUV = 'suv',
  VAN = 'van'
}

export enum BookingType {
  ONE_WAY = 'one_way',
  RETURN = 'return', 
  HOURLY = 'hourly',
  FLEET = 'fleet'
}

export enum TimePeriod {
  DAY = 'day',
  NIGHT = 'night',
  PEAK_MORNING = 'peak_morning',
  PEAK_EVENING = 'peak_evening',
  WEEKEND = 'weekend'
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface PricingRequestData {
  pickup: string;
  dropoff: string;
  vehicleType: VehicleType;
  bookingType: BookingType;
  dateTime: string;
  distance?: number;
  duration?: number;
  hours?: number; // For hourly bookings
  coordinates?: {
    pickup: Coordinates;
    dropoff: Coordinates;
  };
  extras?: string[];
  corporateTier?: string;
  fleetConfig?: Record<string, number>; // For fleet bookings
}

export interface VehicleRates {
  base: number;
  perMile: [number, number]; // [first6miles, after6miles]
  perMin: number;
  hourly: [number, number]; // [inTown, outOfTown]
  minimum: number;
}

export interface VehicleConfig {
  name: string;
  rates: VehicleRates;
}

export interface TimeMultipliers {
  [TimePeriod.DAY]: number;
  [TimePeriod.NIGHT]: number;
  [TimePeriod.PEAK_MORNING]: number;
  [TimePeriod.PEAK_EVENING]: number;
  [TimePeriod.WEEKEND]: number;
}

export interface EventMultipliers {
  christmas: number;
  newYear: number;
  wimbledon: number;
  default: number;
}

export interface AirportFee {
  fee: number;
  wait: number;
}

export interface ZoneFees {
  airports: Record<string, AirportFee>;
  congestion: Record<string, number>;
  tolls: Record<string, number>;
}

export interface ServicePolicies {
  multiStop: number;
  waitingRate: number;
  freeWaiting: {
    normal: number;
    airport: number;
  };
  minimums: {
    distance: number; // in miles
    time: number; // in minutes
  };
}

export interface PricingPolicies {
  rounding: {
    to: number;
    direction: 'up' | 'down' | 'nearest';
  };
  cancellation: {
    freeHours: number;
    chargeRate: number;
  };
  corporate: {
    tier1: number;
    tier2: number;
  };
}

export interface PricingConfig {
  vehicles: Record<VehicleType, VehicleConfig>;
  multipliers: {
    time: TimeMultipliers;
    events: EventMultipliers;
  };
  zones: ZoneFees;
  services: ServicePolicies;
  policies: PricingPolicies;
  premiumServices?: any; // Premium services from Supabase
}

export interface PricingBreakdownData {
  baseFare: number;
  distanceFee: number;
  timeFee: number;
  airportFees: number;
  zoneFees: number;
  tollFees: number;
  multiStopFees: number;
  waitingFees: number;
  extraServices: number;
  subtotal: number;
  multipliers: Record<string, number>;
  discounts: number;
  finalPrice: number;
  details: PricingDetail[];
}

export interface PricingDetail {
  component: string;
  amount: number;
  description: string;
}

/**
 * Leg breakdown for RETURN and FLEET bookings
 */
export interface LegBreakdown {
  leg_number: number;
  leg_type: 'outbound' | 'return' | 'vehicle'; // outbound/return for RETURN, vehicle for FLEET
  vehicle_category?: string; // For FLEET: 'EXEC', 'LUX', 'SUV', 'VAN'
  vehicle_index?: number; // For FLEET: 1, 2, 3... (which vehicle of this category)
  pickup_location?: string;
  destination?: string;
  scheduled_at?: string;
  distance_miles?: number;
  duration_min?: number;
  
  // Pricing breakdown per leg
  pricing: {
    baseFare: number;
    distanceFee: number;
    timeFee: number;
    airportFees: number;
    zoneFees: number;
    tollFees: number;
    extraServices: number;
    subtotal: number;
    leg_price: number; // Final price for this leg
  };
  
  // Commission breakdown per leg
  platform_fee: number;
  operator_net: number;
  driver_payout: number;
}

/**
 * Fleet summary per vehicle category
 */
export interface FleetCategorySummary {
  category: string; // 'EXEC', 'LUX', 'SUV', 'VAN'
  count: number;
  unit_price: number;
  total: number;
}

export interface PricingResult {
  success: boolean;
  finalPrice?: number;
  currency?: string;
  breakdown?: {
    baseFare: number;
    distanceFee: number;
    timeFee: number;
    additionalFees: number;
    services: number;
    subtotal: number;
    multipliers: Record<string, number>;
    discounts: number;
    finalPrice: number;
  };
  details?: PricingDetail[];
  
  // ✅ NEW: Legs breakdown for RETURN and FLEET
  legs?: LegBreakdown[];
  
  // ✅ NEW: Fleet summary (only for FLEET bookings)
  fleet_summary?: FleetCategorySummary[];
  
  error?: string;
  code?: number;
  timestamp: string;
}

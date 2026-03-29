/**
 * TypeScript interfaces and types for pricing system
 * Strict typing for professional development
 */

export enum VehicleType {
  EXECUTIVE = 'executive',
  LUXURY = 'luxury',
  SUV = 'suv',
  MPV = 'mpv'
}

export enum BookingType {
  ONE_WAY = 'oneway',
  RETURN = 'return',
  HOURLY = 'hourly',
  DAILY = 'daily',
  FLEET = 'fleet',
  BESPOKE = 'bespoke' // Note: BESPOKE out of scope for pricing engine, handled separately
}

/**
 * Booking types supported by pricing engine
 * BESPOKE excluded - handled by separate flow
 */
export type PricingEngineBookingType =
  | BookingType.ONE_WAY
  | BookingType.RETURN
  | BookingType.HOURLY
  | BookingType.DAILY
  | BookingType.FLEET;

export enum TimePeriod {
  DAY = 'day',
  NIGHT = 'night',
  PEAK_MORNING = 'peak_morning',
  PEAK_EVENING = 'peak_evening',
  WEEKEND = 'weekend'
}

export enum LegKind {
  MAIN = 'main',
  RETURN = 'return'
}

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Raw coordinates from frontend - accepts both tuple and object format
 */
export type RawCoordinates = [number, number] | { lat: number | null; lng: number | null };

/**
 * Input location data from frontend (before normalization)
 * Accepts coordinates as tuple [lat, lng] or object { lat, lng }
 */
export interface TripPointInput {
  placeId?: string | null;
  address: string;
  coordinates?: RawCoordinates;
  type?: 'address' | 'airport' | 'hotel' | 'poi';
}

/**
 * Normalized location data for trip points (after parsing)
 * Used internally in pricing engine
 */
export interface TripPoint {
  placeId?: string | null;
  address: string;
  coordinates?: Coordinates | null;
  type?: 'address' | 'airport' | 'hotel' | 'poi';
}

/**
 * Public pricing request data (accepts raw input from frontend)
 * Parser will normalize this into strict internal types
 */
export interface PricingRequestData {
  bookingType: BookingType;
  vehicleType?: VehicleType;
  dateTime: string;

  // ONE_WAY & RETURN locations
  pickup?: TripPointInput;
  dropoff?: TripPointInput;
  additionalStops?: TripPointInput[];

  // RETURN specific
  returnDateTime?: string;
  returnPickup?: TripPointInput;
  returnDropoff?: TripPointInput;
  returnAdditionalStops?: TripPointInput[];

  // HOURLY
  hours?: number;

  // DAILY
  days?: number;

  // FLEET
  fleetConfig?: Partial<Record<VehicleType, number>>;

  // Compatibility (not source of truth - backend may recompute)
  distance?: number;
  duration?: number;

  // Additional fields
  extras?: string[];
  servicePackages?: {
    includedServices?: string[];
    premiumFeatures?: string[];
    tripPreferences?: {
      music?: string;
      temperature?: string;
      communication?: string;
    };
    paidUpgrades?: string[];
  };
  passengers?: number;
  luggage?: number;
  flightNumber?: string;
  customRequirements?: string;
  corporateTier?: string;
  organizationId?: string;
}

/**
 * Normalized internal request types (after validation & parsing)
 * Used by pricing handlers
 */
export interface NormalizedOneWayRequest {
  bookingType: BookingType.ONE_WAY;
  vehicleType: VehicleType;
  dateTime: string;
  pickup: TripPoint;
  dropoff: TripPoint;
  additionalStops: TripPoint[];
  distance?: number;
  duration?: number;
  extras: string[];
  tripPreferences?: {
    music?: string;
    temperature?: string;
    communication?: string;
  };
  passengers?: number;
  luggage?: number;
  flightNumber?: string;
  customRequirements?: string;
  organizationId?: string;
}

export interface NormalizedReturnRequest {
  bookingType: BookingType.RETURN;
  vehicleType: VehicleType;
  dateTime: string;
  pickup: TripPoint;
  dropoff: TripPoint;
  additionalStops: TripPoint[];
  returnDateTime: string;
  returnPickup: TripPoint;
  returnDropoff: TripPoint;
  returnAdditionalStops: TripPoint[];
  distance?: number; // Optional: outbound distance hint
  duration?: number; // Optional: outbound duration hint
  extras: string[];
  tripPreferences?: {
    music?: string;
    temperature?: string;
    communication?: string;
  };
  passengers?: number;
  luggage?: number;
  flightNumber?: string;
  customRequirements?: string;
  organizationId?: string;
}

export interface NormalizedHourlyRequest {
  bookingType: BookingType.HOURLY;
  vehicleType: VehicleType;
  dateTime: string;
  hours: number;
  pickup: TripPoint;
  dropoff?: TripPoint;
  extras: string[];
  tripPreferences?: {
    music?: string;
    temperature?: string;
    communication?: string;
  };
  passengers?: number;
  luggage?: number;
  flightNumber?: string;
  customRequirements?: string;
  organizationId?: string;
}

export interface NormalizedDailyRequest {
  bookingType: BookingType.DAILY;
  vehicleType: VehicleType;
  dateTime: string;
  days: number;
  pickup: TripPoint;
  dropoff?: TripPoint;
  extras: string[];
  tripPreferences?: {
    music?: string;
    temperature?: string;
    communication?: string;
  };
  passengers?: number;
  luggage?: number;
  flightNumber?: string;
  customRequirements?: string;
  organizationId?: string;
}

export interface NormalizedFleetRequest {
  bookingType: BookingType.FLEET;
  baseServiceType: BookingType.ONE_WAY | BookingType.HOURLY | BookingType.DAILY; // Fleet layer over base service
  dateTime: string;
  pickup: TripPoint;
  dropoff?: TripPoint; // Optional for HOURLY/DAILY, required for ONE_WAY
  additionalStops: TripPoint[];
  fleetConfig: Partial<Record<VehicleType, number>>; // e.g., { executive: 2, luxury: 1 }

  // For FLEET + ONE_WAY
  distance?: number; // Shared route distance for all vehicles
  duration?: number; // Shared route duration for all vehicles

  // For FLEET + HOURLY
  hours?: number; // Explicit hours (not calculated from duration)

  // For FLEET + DAILY
  days?: number; // Explicit days (not calculated from duration)

  extras: string[];
  tripPreferences?: {
    music?: string;
    temperature?: string;
    communication?: string;
  };
  passengers?: number;
  luggage?: number;
  flightNumber?: string;
  customRequirements?: string;
  organizationId?: string;
}

export type NormalizedPricingRequest =
  | NormalizedOneWayRequest
  | NormalizedReturnRequest
  | NormalizedHourlyRequest
  | NormalizedDailyRequest
  | NormalizedFleetRequest;
// BESPOKE intentionally excluded from pricing engine normalized flow

export interface VehicleRates {
  base: number;
  perMile: [number, number]; // [first6miles, after6miles]
  perMin: number;
  hourly: [number, number]; // [inTown, outOfTown]
  daily?: number; // Daily rate (per day)
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
  hourly_settings?: {
    rates: Record<string, number>;
    minimum_hours: number;
    maximum_hours: number;
    distance_limit_per_hour?: number;
    area_restriction?: string;
  };
  daily_settings?: {
    rates: Record<string, number>;
    minimum_days: number;
    maximum_days: number;
    hours_per_day: number;
    distance_limit_per_day?: number;
    area_restriction?: string;
  };
  return_settings?: {
    discount_rate: number;
    minimum_hours_between: number;
  };
  fleet_settings?: {
    discounts: {
      tier1: { min_vehicles: number; discount_rate: number };
      tier2: { min_vehicles: number; discount_rate: number };
    };
    premium_services_multiply?: boolean;
  };
  time_period_config?: {
    peak_morning: { start: string; end: string; days: number[] };
    peak_evening: { start: string; end: string; days: number[] };
    night: { start: string; end: string; days: number[] };
    weekend: { days: number[] };
  };
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
  serviceItemFees: number;
  subtotal: number;
  multipliers: Record<string, number>;
  discounts: {
    total: number;
    returnDiscount?: number;
    fleetDiscount?: number;
    corporateDiscount?: number;
  };
  finalPrice: number;
  details: PricingDetail[];
}

export interface PricingDetail {
  component: string;
  amount: number;
  description: string;
}

/**
 * Operational leg breakdown for RETURN and FLEET bookings
 * Aligned with DB booking_legs.leg_kind enum
 */
export interface LegBreakdown {
  leg_number: number;
  leg_kind: 'main' | 'return' | 'fleet_item'; // Aligned with DB enum
  booking_leg_id?: string; // Real booking_legs.id - MUST exist before creating client_leg_quotes
  vehicle_category?: VehicleType; // For FLEET
  vehicle_unit_index?: number; // 1-based index of vehicle instance within booking/fleet expansion
  pickup?: TripPoint;
  dropoff?: TripPoint;
  scheduled_at?: string;
  distance_miles?: number;
  duration_min?: number;
  stops?: TripPoint[]; // Additional stops for this leg

  // Pricing breakdown per leg
  pricing: {
    baseFare: number;
    distanceFee: number;
    timeFee: number;
    multiStopFee: number;
    waitingFees: number;
    airportFees: number;
    zoneFees: number;
    tollFees: number;
    serviceItemFees: number;
    subtotal: number;
    multipliers: Record<string, number>;
    discount: number; // Proportionally allocated discount
    finalPrice: number; // Final price for this leg after discount
    details: PricingDetail[];
  };

  // Commission breakdown per leg (camelCase for TS consistency)
  platformFee: number;
  operatorNet: number;
  driverPayout: number;
}

/**
 * Fleet summary per vehicle category
 */
export interface FleetCategorySummary {
  category: VehicleType;
  count: number;
  unit_price: number;
  total: number;
}

export interface PricingResult {
  success: boolean;
  finalPrice?: number; // Shortcut/convenience - same as bookingBreakdown.finalPrice
  currency?: string;
  pricing_version_id?: string; // UUID of pricing version used

  // Booking-level breakdown
  bookingBreakdown?: PricingBreakdownData;

  // Operational legs breakdown (for RETURN and FLEET)
  legs?: LegBreakdown[];

  // Fleet summary (only for FLEET bookings)
  fleetSummary?: FleetCategorySummary[];

  // Normalized route input (for auditability)
  normalizedRoute?: {
    bookingType?: BookingType;
    dateTime?: string;
    returnDateTime?: string;
    pickup?: TripPoint;
    additionalStops?: TripPoint[];
    dropoff?: TripPoint;
    returnPickup?: TripPoint;
    returnAdditionalStops?: TripPoint[];
    returnDropoff?: TripPoint;
  };

  // Legacy compatibility (deprecated - use bookingBreakdown)
  details?: PricingDetail[];

  error?: string;
  code?: number;
  timestamp: string;
}

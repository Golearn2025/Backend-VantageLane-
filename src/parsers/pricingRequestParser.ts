/**
 * Pricing Request Parser
 * 
 * Transforms validated PricingRequestData into strict normalized types
 * - Normalizes coordinates from tuple/object to Coordinates
 * - Converts TripPointInput to TripPoint
 * - Produces discriminated union NormalizedPricingRequest
 */

import {
  PricingRequestData,
  BookingType,
  VehicleType,
  TripPoint,
  TripPointInput,
  Coordinates,
  NormalizedOneWayRequest,
  NormalizedReturnRequest,
  NormalizedHourlyRequest,
  NormalizedDailyRequest,
  NormalizedFleetRequest,
  NormalizedPricingRequest,
} from '../types/pricing.types';
import { normalizeServicePackagesToExtras } from './servicePackagesNormalizer';

export interface ParseError {
  field: string;
  message: string;
  code: string;
}

export interface ParseResult {
  success: boolean;
  data?: NormalizedPricingRequest;
  errors?: ParseError[];
}

/**
 * Main parser function
 * Assumes request has already been validated
 */
export function parsePricingRequest(request: PricingRequestData): ParseResult {
  try {
    switch (request.bookingType) {
      case BookingType.ONE_WAY:
        return parseOneWay(request);
      case BookingType.RETURN:
        return parseReturn(request);
      case BookingType.HOURLY:
        return parseHourly(request);
      case BookingType.DAILY:
        return parseDaily(request);
      case BookingType.FLEET:
        return parseFleet(request);
      default:
        return {
          success: false,
          errors: [
            {
              field: 'bookingType',
              message: `Unsupported booking type: ${request.bookingType}`,
              code: 'UNSUPPORTED_BOOKING_TYPE',
            },
          ],
        };
    }
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          field: 'unknown',
          message: error instanceof Error ? error.message : 'Unknown parsing error',
          code: 'PARSE_ERROR',
        },
      ],
    };
  }
}

/**
 * Parse ONE_WAY request
 */
function parseOneWay(request: PricingRequestData): ParseResult {
  const errors: ParseError[] = [];

  const pickup = normalizeTripPoint(request.pickup, 'pickup', errors);
  const dropoff = normalizeTripPoint(request.dropoff, 'dropoff', errors);
  const additionalStops = normalizeStopsArray(request.additionalStops || [], 'additionalStops', errors);

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Normalize servicePackages to extras array
  const { extras, tripPreferences } = normalizeServicePackagesToExtras(request);

  const normalized: NormalizedOneWayRequest = {
    bookingType: BookingType.ONE_WAY,
    vehicleType: request.vehicleType!,
    dateTime: request.dateTime,
    pickup: pickup!,
    dropoff: dropoff!,
    additionalStops,
    distance: request.distance,
    duration: request.duration,
    extras,
    tripPreferences,
    passengers: request.passengers,
    luggage: request.luggage,
    flightNumber: request.flightNumber,
    vehicleModel: request.vehicleModel,
    customRequirements: request.customRequirements,
    organizationId: request.organizationId,
  };

  return { success: true, data: normalized };
}

/**
 * Parse RETURN request
 */
function parseReturn(request: PricingRequestData): ParseResult {
  const errors: ParseError[] = [];

  const pickup = normalizeTripPoint(request.pickup, 'pickup', errors);
  const dropoff = normalizeTripPoint(request.dropoff, 'dropoff', errors);
  const additionalStops = normalizeStopsArray(request.additionalStops || [], 'additionalStops', errors);

  const returnPickup = normalizeTripPoint(request.returnPickup, 'returnPickup', errors);
  const returnDropoff = normalizeTripPoint(request.returnDropoff, 'returnDropoff', errors);
  const returnAdditionalStops = normalizeStopsArray(
    request.returnAdditionalStops || [],
    'returnAdditionalStops',
    errors
  );

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Normalize servicePackages to extras array
  const { extras, tripPreferences } = normalizeServicePackagesToExtras(request);

  const normalized: NormalizedReturnRequest = {
    bookingType: BookingType.RETURN,
    vehicleType: request.vehicleType!,
    dateTime: request.dateTime,
    pickup: pickup!,
    dropoff: dropoff!,
    additionalStops,
    returnDateTime: request.returnDateTime!,
    returnPickup: returnPickup!,
    returnDropoff: returnDropoff!,
    returnAdditionalStops,
    distance: request.distance,
    duration: request.duration,
    extras,
    tripPreferences,
    passengers: request.passengers,
    luggage: request.luggage,
    flightNumber: request.flightNumber,
    returnFlightNumber: request.returnFlightNumber,
    vehicleModel: request.vehicleModel,
    customRequirements: request.customRequirements,
    organizationId: request.organizationId,
  };

  return { success: true, data: normalized };
}

/**
 * Parse HOURLY request
 */
function parseHourly(request: PricingRequestData): ParseResult {
  const errors: ParseError[] = [];

  const pickup = normalizeTripPoint(request.pickup, 'pickup', errors);
  const dropoff = request.dropoff
    ? normalizeTripPoint(request.dropoff, 'dropoff', errors)
    : undefined;

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Normalize servicePackages to extras array
  const { extras, tripPreferences } = normalizeServicePackagesToExtras(request);

  const normalized: NormalizedHourlyRequest = {
    bookingType: BookingType.HOURLY,
    vehicleType: request.vehicleType!,
    dateTime: request.dateTime,
    hours: request.hours!,
    pickup: pickup!,
    dropoff,
    extras,
    tripPreferences,
    passengers: request.passengers,
    luggage: request.luggage,
    flightNumber: request.flightNumber,
    vehicleModel: request.vehicleModel,
    customRequirements: request.customRequirements,
    organizationId: request.organizationId,
  };

  return { success: true, data: normalized };
}

/**
 * Parse DAILY request
 */
function parseDaily(request: PricingRequestData): ParseResult {
  const errors: ParseError[] = [];

  const pickup = normalizeTripPoint(request.pickup, 'pickup', errors);
  const dropoff = request.dropoff
    ? normalizeTripPoint(request.dropoff, 'dropoff', errors)
    : undefined;

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Normalize servicePackages to extras array
  const { extras, tripPreferences } = normalizeServicePackagesToExtras(request);

  const normalized: NormalizedDailyRequest = {
    bookingType: BookingType.DAILY,
    vehicleType: request.vehicleType!,
    dateTime: request.dateTime,
    days: request.days!,
    pickup: pickup!,
    dropoff,
    extras,
    tripPreferences,
    passengers: request.passengers,
    luggage: request.luggage,
    flightNumber: request.flightNumber,
    vehicleModel: request.vehicleModel,
    customRequirements: request.customRequirements,
    organizationId: request.organizationId,
  };

  return { success: true, data: normalized };
}

/**
 * Parse FLEET request
 */
function parseFleet(request: PricingRequestData): ParseResult {
  const errors: ParseError[] = [];

  const pickup = normalizeTripPoint(request.pickup, 'pickup', errors);
  const dropoff = normalizeTripPoint(request.dropoff, 'dropoff', errors);
  const additionalStops = normalizeStopsArray(request.additionalStops || [], 'additionalStops', errors);

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Determine base service type from request context
  // Check for hours/days to determine if FLEET+HOURLY or FLEET+DAILY
  let baseServiceType: BookingType.ONE_WAY | BookingType.HOURLY | BookingType.DAILY;

  if (request.hours != null && request.hours > 0) {
    baseServiceType = BookingType.HOURLY;
  } else if (request.days != null && request.days > 0) {
    baseServiceType = BookingType.DAILY;
  } else {
    baseServiceType = BookingType.ONE_WAY;
  }

  // Normalize servicePackages to extras array
  const { extras, tripPreferences } = normalizeServicePackagesToExtras(request);

  const normalized: NormalizedFleetRequest = {
    bookingType: BookingType.FLEET,
    baseServiceType,
    dateTime: request.dateTime,
    pickup: pickup!,
    dropoff: dropoff,
    additionalStops,
    fleetConfig: request.fleetConfig!,
    fleetVehicles: request.fleetVehicles,
    distance: request.distance,
    duration: request.duration,
    hours: request.hours,
    days: request.days,
    extras,
    tripPreferences,
    passengers: request.passengers,
    luggage: request.luggage,
    flightNumber: request.flightNumber,
    vehicleModel: request.vehicleModel,
    customRequirements: request.customRequirements,
    organizationId: request.organizationId,
  };

  return { success: true, data: normalized };
}

/**
 * Normalize a TripPointInput to TripPoint
 * Converts coordinates from tuple/object to Coordinates
 */
function normalizeTripPoint(
  input: TripPointInput | undefined,
  fieldName: string,
  errors: ParseError[]
): TripPoint | undefined {
  if (!input) {
    return undefined;
  }

  const normalized: TripPoint = {
    placeId: input.placeId,
    address: input.address,
    coordinates: normalizeCoordinates(input.coordinates),
    type: input.type,
  };

  return normalized;
}

/**
 * Normalize coordinates from tuple [lat, lng] or object {lat, lng} to Coordinates
 */
function normalizeCoordinates(
  coords: [number, number] | { lat: number | null; lng: number | null } | undefined
): Coordinates | null {
  if (!coords) {
    return null;
  }

  if (Array.isArray(coords)) {
    // Tuple format [lat, lng]
    const [lat, lng] = coords;
    return { lat, lng };
  } else {
    // Object format { lat, lng }
    const { lat, lng } = coords;
    if (lat === null || lng === null) {
      return null;
    }
    return { lat, lng };
  }
}

/**
 * Normalize array of stops
 */
function normalizeStopsArray(
  stops: TripPointInput[],
  fieldName: string,
  errors: ParseError[]
): TripPoint[] {
  return stops
    .map((stop, index) => normalizeTripPoint(stop, `${fieldName}[${index}]`, errors))
    .filter((stop): stop is TripPoint => stop !== undefined);
}

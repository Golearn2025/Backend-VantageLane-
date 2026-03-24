/**
 * Leg Builder
 * 
 * Constructs operational legs for different booking types
 * - ONE_WAY: 1 leg with stops_raw
 * - RETURN: 2 legs (outbound + return)
 * - FLEET: N legs (1 per vehicle)
 */

import {
  TripPoint,
  BookingType,
  VehicleType,
  NormalizedOneWayRequest,
  NormalizedReturnRequest,
  NormalizedFleetRequest,
} from '../types/pricing.types';
import { NormalizedRoute } from '../normalizers/routeNormalizer';

export interface OperationalLeg {
  legNumber: number; // 1-based
  legKind: 'main' | 'return' | 'fleet_item';
  vehicleType?: VehicleType;
  vehicleUnitIndex?: number; // 1-based for fleet
  pickup: TripPoint;
  dropoff: TripPoint;
  stops: TripPoint[]; // Additional stops for this leg
  scheduledAt: string; // ISO datetime
  route: NormalizedRoute;
}

/**
 * Build operational leg for ONE_WAY booking
 */
export function buildOneWayLeg(
  request: NormalizedOneWayRequest,
  route: NormalizedRoute
): OperationalLeg {
  return {
    legNumber: 1,
    legKind: 'main',
    vehicleType: request.vehicleType,
    pickup: request.pickup,
    dropoff: request.dropoff,
    stops: request.additionalStops,
    scheduledAt: request.dateTime,
    route,
  };
}

/**
 * Build operational legs for RETURN booking
 * Returns 2 legs: outbound (main) + return
 */
export function buildReturnLegs(
  request: NormalizedReturnRequest,
  outboundRoute: NormalizedRoute,
  returnRoute: NormalizedRoute
): OperationalLeg[] {
  const outboundLeg: OperationalLeg = {
    legNumber: 1,
    legKind: 'main',
    vehicleType: request.vehicleType,
    pickup: request.pickup,
    dropoff: request.dropoff,
    stops: request.additionalStops,
    scheduledAt: request.dateTime,
    route: outboundRoute,
  };

  const returnLeg: OperationalLeg = {
    legNumber: 2,
    legKind: 'return',
    vehicleType: request.vehicleType,
    pickup: request.returnPickup,
    dropoff: request.returnDropoff,
    stops: request.returnAdditionalStops,
    scheduledAt: request.returnDateTime,
    route: returnRoute,
  };

  return [outboundLeg, returnLeg];
}

/**
 * Build operational legs for FLEET booking
 * Returns N legs (1 per vehicle instance)
 */
export function buildFleetLegs(
  request: NormalizedFleetRequest,
  route: NormalizedRoute
): OperationalLeg[] {
  const legs: OperationalLeg[] = [];
  let legNumber = 1;

  // Iterate through fleet config and create legs
  Object.entries(request.fleetConfig).forEach(([vehicleType, count]) => {
    for (let unitIndex = 1; unitIndex <= count; unitIndex++) {
      legs.push({
        legNumber,
        legKind: 'fleet_item',
        vehicleType: vehicleType as VehicleType,
        vehicleUnitIndex: unitIndex,
        pickup: request.pickup,
        dropoff: request.dropoff,
        stops: request.additionalStops,
        scheduledAt: request.dateTime,
        route, // All fleet vehicles share same route
      });
      legNumber++;
    }
  });

  return legs;
}

/**
 * Validate operational leg structure
 */
export function validateOperationalLeg(leg: OperationalLeg): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (leg.legNumber < 1) {
    errors.push('Leg number must be >= 1');
  }

  if (!leg.pickup || !leg.pickup.address) {
    errors.push('Leg must have valid pickup location');
  }

  if (!leg.dropoff || !leg.dropoff.address) {
    errors.push('Leg must have valid dropoff location');
  }

  if (!leg.scheduledAt) {
    errors.push('Leg must have scheduled datetime');
  }

  if (leg.legKind === 'fleet_item' && !leg.vehicleUnitIndex) {
    errors.push('Fleet leg must have vehicle unit index');
  }

  if (leg.legKind === 'fleet_item' && leg.vehicleUnitIndex && leg.vehicleUnitIndex < 1) {
    errors.push('Vehicle unit index must be >= 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

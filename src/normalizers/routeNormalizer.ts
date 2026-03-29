/**
 * Route Normalizer
 * 
 * Normalizes route data for pricing calculations
 * - Builds ordered route points from pickup → stops → dropoff
 * - Calculates route segments for multi-stop trips
 * - Validates route structure
 */

import { TripPoint } from '../types/pricing.types';

export interface RoutePoint {
  point: TripPoint;
  index: number; // Position in route (0-based)
  type: 'pickup' | 'stop' | 'dropoff';
}

export interface RouteSegment {
  from: RoutePoint;
  to: RoutePoint;
  segmentIndex: number; // 0-based segment number
}

export interface NormalizedRoute {
  pickup: TripPoint;
  stops: TripPoint[]; // Cleaned intermediate stops
  dropoff: TripPoint;
  points: RoutePoint[]; // All points in order (pickup, stops, dropoff)
  segments: RouteSegment[]; // Route segments between consecutive points
  totalStops: number; // Count of intermediate stops (excludes pickup/dropoff)
}

/**
 * Normalize route from pickup, stops, and dropoff
 * - Cleans and validates stops
 * - Removes empty/invalid stops
 * - Trims addresses
 * - Returns ordered route points and segments
 */
export function normalizeRoute(
  pickup: TripPoint,
  dropoff: TripPoint,
  additionalStops?: TripPoint[]
): NormalizedRoute {
  // Clean and validate stops
  const cleanedStops = cleanStops(additionalStops);

  // Build ordered route points
  const points: RoutePoint[] = [];

  // 1. Pickup (always first)
  const cleanedPickup = cleanTripPoint(pickup);
  points.push({
    point: cleanedPickup,
    index: 0,
    type: 'pickup',
  });

  // 2. Additional stops (in order)
  cleanedStops.forEach((stop, idx) => {
    points.push({
      point: stop,
      index: idx + 1,
      type: 'stop',
    });
  });

  // 3. Dropoff (always last)
  const cleanedDropoff = cleanTripPoint(dropoff);
  points.push({
    point: cleanedDropoff,
    index: cleanedStops.length + 1,
    type: 'dropoff',
  });

  // Build route segments
  const segments: RouteSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      from: points[i],
      to: points[i + 1],
      segmentIndex: i,
    });
  }

  return {
    pickup: cleanedPickup,
    stops: cleanedStops,
    dropoff: cleanedDropoff,
    points,
    segments,
    totalStops: cleanedStops.length,
  };
}

/**
 * Calculate total route metrics from segments
 * Computes real distance/duration using RouteCalculationService when not provided
 */
export interface RouteMetrics {
  totalDistance?: number; // miles
  totalDuration?: number; // minutes
  segmentCount: number;
  metricsSource: 'provided' | 'computed' | 'missing';
}

export async function calculateRouteMetrics(
  route: NormalizedRoute,
  providedDistance?: number,
  providedDuration?: number
): Promise<RouteMetrics> {
  // If both distance and duration provided, use them
  if (providedDistance !== undefined && providedDuration !== undefined) {
    return {
      totalDistance: providedDistance,
      totalDuration: providedDuration,
      segmentCount: route.segments.length,
      metricsSource: 'provided',
    };
  }

  // Otherwise, compute from route segments using RouteCalculationService
  try {
    const { RouteCalculationService } = await import('../services/RouteCalculationService');
    const computed = await RouteCalculationService.calculateRouteMetrics(route.segments);

    return {
      totalDistance: computed.totalDistance,
      totalDuration: computed.totalDuration,
      segmentCount: route.segments.length,
      metricsSource: 'computed',
    };
  } catch (error) {
    console.error('Failed to compute route metrics:', error);

    // Fallback to provided values if available
    if (providedDistance !== undefined || providedDuration !== undefined) {
      return {
        totalDistance: providedDistance,
        totalDuration: providedDuration,
        segmentCount: route.segments.length,
        metricsSource: 'provided',
      };
    }

    // No metrics available
    return {
      totalDistance: undefined,
      totalDuration: undefined,
      segmentCount: route.segments.length,
      metricsSource: 'missing',
    };
  }
}

/**
 * Validate route structure
 */
export function validateRoute(route: NormalizedRoute): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Must have at least 2 points (pickup + dropoff)
  if (route.points.length < 2) {
    errors.push('Route must have at least pickup and dropoff');
  }

  // First point must be pickup
  if (route.points.length > 0 && route.points[0].type !== 'pickup') {
    errors.push('First route point must be pickup');
  }

  // Last point must be dropoff
  if (route.points.length > 1 && route.points[route.points.length - 1].type !== 'dropoff') {
    errors.push('Last route point must be dropoff');
  }

  // All points must have addresses
  route.points.forEach((point, idx) => {
    if (!point.point.address || point.point.address.trim().length === 0) {
      errors.push(`Route point ${idx} missing address`);
    }
  });

  // Segments count should be points - 1
  if (route.segments.length !== route.points.length - 1) {
    errors.push('Invalid segment count');
  }

  // Validate segment connectivity
  route.segments.forEach((segment, idx) => {
    if (segment.from.index + 1 !== segment.to.index) {
      errors.push(`Segment ${idx} not consecutive: ${segment.from.index} -> ${segment.to.index}`);
    }
  });

  // First segment must start from pickup
  if (route.segments.length > 0 && route.segments[0].from.type !== 'pickup') {
    errors.push('First segment must start from pickup');
  }

  // Last segment must end at dropoff
  if (route.segments.length > 0 && route.segments[route.segments.length - 1].to.type !== 'dropoff') {
    errors.push('Last segment must end at dropoff');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format route for display/logging
 */
export function formatRoute(route: NormalizedRoute): string {
  return route.points
    .map((p) => {
      const prefix = p.type === 'pickup' ? '📍' : p.type === 'dropoff' ? '🎯' : '⏸️';
      return `${prefix} ${p.point.address}`;
    })
    .join(' → ');
}

/**
 * Clean and validate stops array
 * - Removes stops with empty/invalid addresses
 * - Trims addresses
 * - Filters out null/undefined entries
 */
function cleanStops(stops: TripPoint[] | undefined): TripPoint[] {
  if (!stops || !Array.isArray(stops)) {
    return [];
  }

  return stops
    .filter((stop) => {
      // Remove null/undefined
      if (!stop) return false;

      // Remove stops without valid address
      if (!stop.address || typeof stop.address !== 'string') return false;

      // Remove stops with empty address after trim
      if (stop.address.trim().length === 0) return false;

      return true;
    })
    .map((stop) => cleanTripPoint(stop));
}

/**
 * Clean individual trip point
 * - Trims address
 * - Normalizes data
 */
function cleanTripPoint(point: TripPoint): TripPoint {
  return {
    ...point,
    address: point.address.trim(),
    placeId: point.placeId?.trim() || point.placeId,
  };
}

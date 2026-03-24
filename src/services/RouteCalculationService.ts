/**
 * Route Calculation Service
 * 
 * Computes real distance and duration for routes with multiple segments
 * Uses Google Maps Distance Matrix API for accurate route metrics
 * 
 * CRITICAL: This service ensures pricing is based on actual route metrics,
 * not just flat rates + stop fees
 */

import { RouteSegment } from '../normalizers/routeNormalizer';
import { Coordinates } from '../types/pricing.types';

export interface RouteMetricsResult {
  totalDistance: number; // miles
  totalDuration: number; // minutes
  segments: SegmentMetrics[];
  source: 'google_maps' | 'mapbox' | 'haversine_fallback';
}

export interface SegmentMetrics {
  segmentIndex: number;
  distance: number; // miles
  duration: number; // minutes
  from: string; // address
  to: string; // address
}

/**
 * Calculate route metrics from segments using external routing service
 */
export class RouteCalculationService {
  /**
   * Calculate total distance and duration for a route with multiple segments
   * 
   * Strategy:
   * 1. Try Google Maps Distance Matrix API (preferred)
   * 2. Fallback to Haversine formula if API unavailable
   * 3. Mark source in result for transparency
   */
  static async calculateRouteMetrics(
    segments: RouteSegment[]
  ): Promise<RouteMetricsResult> {
    if (segments.length === 0) {
      throw new Error('Cannot calculate metrics for empty route');
    }

    // Try Google Maps API first
    if (process.env.GOOGLE_MAPS_API_KEY) {
      try {
        return await this.calculateWithGoogleMaps(segments);
      } catch (error) {
        console.warn('Google Maps API failed, falling back to Haversine:', error);
      }
    }

    // Fallback to Haversine formula
    return this.calculateWithHaversine(segments);
  }

  /**
   * Calculate using Google Maps Distance Matrix API
   * Provides most accurate real-world routing
   */
  private static async calculateWithGoogleMaps(
    segments: RouteSegment[]
  ): Promise<RouteMetricsResult> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    const segmentMetrics: SegmentMetrics[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    // Calculate each segment individually for accuracy
    for (const segment of segments) {
      const origin = this.formatCoordinates(segment.from.point.coordinates);
      const destination = this.formatCoordinates(segment.to.point.coordinates);

      if (!origin || !destination) {
        throw new Error(`Missing coordinates for segment ${segment.segmentIndex}`);
      }

      const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
      url.searchParams.append('origins', origin);
      url.searchParams.append('destinations', destination);
      url.searchParams.append('mode', 'driving');
      url.searchParams.append('units', 'imperial'); // miles
      url.searchParams.append('key', apiKey);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${data.status}`);
      }

      const element = data.rows[0]?.elements[0];
      if (!element || element.status !== 'OK') {
        throw new Error(`No route found for segment ${segment.segmentIndex}`);
      }

      // Google returns meters and seconds, convert to miles and minutes
      const distanceMiles = element.distance.value / 1609.34; // meters to miles
      const durationMinutes = element.duration.value / 60; // seconds to minutes

      segmentMetrics.push({
        segmentIndex: segment.segmentIndex,
        distance: distanceMiles,
        duration: durationMinutes,
        from: segment.from.point.address,
        to: segment.to.point.address,
      });

      totalDistance += distanceMiles;
      totalDuration += durationMinutes;
    }

    return {
      totalDistance: Math.round(totalDistance * 10) / 10, // Round to 1 decimal
      totalDuration: Math.round(totalDuration),
      segments: segmentMetrics,
      source: 'google_maps',
    };
  }

  /**
   * Calculate using Haversine formula (fallback)
   * Less accurate but doesn't require external API
   */
  private static calculateWithHaversine(
    segments: RouteSegment[]
  ): RouteMetricsResult {
    const segmentMetrics: SegmentMetrics[] = [];
    let totalDistance = 0;

    for (const segment of segments) {
      const from = segment.from.point.coordinates;
      const to = segment.to.point.coordinates;

      if (!from || !to) {
        throw new Error(`Missing coordinates for segment ${segment.segmentIndex}`);
      }

      const distance = this.haversineDistance(from, to);

      segmentMetrics.push({
        segmentIndex: segment.segmentIndex,
        distance,
        duration: this.estimateDuration(distance), // Estimate based on distance
        from: segment.from.point.address,
        to: segment.to.point.address,
      });

      totalDistance += distance;
    }

    const totalDuration = this.estimateDuration(totalDistance);

    return {
      totalDistance: Math.round(totalDistance * 10) / 10,
      totalDuration: Math.round(totalDuration),
      segments: segmentMetrics,
      source: 'haversine_fallback',
    };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in miles
   */
  private static haversineDistance(
    coord1: Coordinates,
    coord2: Coordinates
  ): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(coord2.lat - coord1.lat);
    const dLng = this.toRadians(coord2.lng - coord1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(coord1.lat)) *
        Math.cos(this.toRadians(coord2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Estimate duration based on distance
   * Assumes average speed of 30 mph in urban areas
   */
  private static estimateDuration(distanceMiles: number): number {
    const averageSpeedMph = 30;
    return (distanceMiles / averageSpeedMph) * 60; // Convert hours to minutes
  }

  /**
   * Convert degrees to radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Format coordinates for Google Maps API
   */
  private static formatCoordinates(coords: Coordinates | null | undefined): string | null {
    if (!coords || coords.lat == null || coords.lng == null) {
      return null;
    }
    return `${coords.lat},${coords.lng}`;
  }
}

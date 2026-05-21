/**
 * London Congestion Charge (CC) zone detection via point-in-polygon.
 * Uses pickup/dropoff coordinates from Google Places (lat/lng).
 */

import { Coordinates, TripPointInput } from '../types/pricing.types';

type LngLat = [number, number];
type PolygonRing = LngLat[];

/** Simplified London CC core — [lng, lat], clockwise. See src/data/london-congestion-zone.geojson */
const CC_RING: PolygonRing = [
  [-0.1788, 51.5028],
  [-0.1582, 51.5245],
  [-0.1298, 51.5288],
  [-0.0985, 51.5235],
  [-0.0728, 51.5172],
  [-0.0685, 51.5055],
  [-0.0712, 51.4948],
  [-0.0825, 51.4875],
  [-0.1055, 51.4838],
  [-0.1288, 51.4855],
  [-0.1485, 51.4902],
  [-0.1655, 51.4968],
  [-0.1788, 51.5028],
];

function normalizeCoordinates(raw: TripPointInput['coordinates']): Coordinates | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const [a, b] = raw;
    if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null;
    // Frontend may send [lat, lng] or [lng, lat]; UK lng is negative, lat ~51
    if (a >= -10 && a <= 10 && Math.abs(b) > 40) {
      return { lng: a, lat: b };
    }
    if (b >= -10 && b <= 10 && Math.abs(a) > 40) {
      return { lng: b, lat: a };
    }
    return { lat: a, lng: b };
  }
  const lat = raw.lat;
  const lng = raw.lng;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function pointFromTripPoint(point: string | TripPointInput | undefined): Coordinates | null {
  if (!point || typeof point === 'string') return null;
  return normalizeCoordinates(point.coordinates);
}

/**
 * Ray-casting point-in-polygon (GeoJSON ring is [lng, lat]).
 */
export function isPointInsideCongestionZone(point: Coordinates): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = CC_RING.length - 1; i < CC_RING.length; j = i++) {
    const [xi, yi] = CC_RING[i];
    const [xj, yj] = CC_RING[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

export type CcTouch = 'pickup' | 'dropoff' | 'both' | null;

/**
 * Returns whether CC applies on this leg (pickup or dropoff inside zone).
 * At most one CC charge per leg — not per endpoint.
 */
export function detectCongestionChargeTouch(
  pickup: string | TripPointInput | undefined,
  dropoff: string | TripPointInput | undefined
): CcTouch {
  const pickupPoint = pointFromTripPoint(pickup);
  const dropoffPoint = pointFromTripPoint(dropoff);

  const pickupInside = pickupPoint ? isPointInsideCongestionZone(pickupPoint) : false;
  const dropoffInside = dropoffPoint ? isPointInsideCongestionZone(dropoffPoint) : false;

  if (pickupInside && dropoffInside) return 'both';
  if (pickupInside) return 'pickup';
  if (dropoffInside) return 'dropoff';
  return null;
}

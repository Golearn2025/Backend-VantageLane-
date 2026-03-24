/**
 * TripPoint Validator
 * Validates location data structure
 */

import { TripPointInput } from '../types/pricing.types';
import { ValidationError, addError } from './validationHelpers';

/**
 * Validate TripPoint structure
 */
export function validateTripPoint(
  point: TripPointInput,
  fieldName: string,
  errors: ValidationError[]
): void {
  if (!point) {
    addError(errors, fieldName, `${fieldName} is required`, 'MISSING_TRIP_POINT');
    return;
  }

  // Address required
  if (!point.address || typeof point.address !== 'string' || point.address.trim().length === 0) {
    addError(
      errors,
      `${fieldName}.address`,
      `Address is required for ${fieldName}`,
      'MISSING_ADDRESS'
    );
  }

  // Coordinates validation (optional but if present must be valid)
  if (point.coordinates) {
    validateCoordinates(point.coordinates, fieldName, errors);
  }

  // Type validation (optional)
  if (point.type) {
    const validTypes = ['address', 'airport', 'hotel', 'poi'];
    if (!validTypes.includes(point.type)) {
      addError(
        errors,
        `${fieldName}.type`,
        `Invalid location type: ${point.type}. Must be one of: ${validTypes.join(', ')}`,
        'INVALID_LOCATION_TYPE'
      );
    }
  }
}

/**
 * Validate coordinates (accepts both tuple and object format)
 */
function validateCoordinates(
  coordinates: any,
  fieldName: string,
  errors: ValidationError[]
): void {
  if (Array.isArray(coordinates)) {
    // Tuple format [lat, lng]
    if (coordinates.length !== 2) {
      addError(
        errors,
        `${fieldName}.coordinates`,
        `Coordinates array must have exactly 2 elements [lat, lng]`,
        'INVALID_COORDINATES_ARRAY_LENGTH'
      );
      return;
    }

    const [lat, lng] = coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      addError(
        errors,
        `${fieldName}.coordinates`,
        `Coordinates must be numbers`,
        'INVALID_COORDINATES_TYPE'
      );
      return;
    }

    if (lat < -90 || lat > 90) {
      addError(
        errors,
        `${fieldName}.coordinates`,
        `Latitude must be between -90 and 90`,
        'LATITUDE_OUT_OF_RANGE'
      );
    }

    if (lng < -180 || lng > 180) {
      addError(
        errors,
        `${fieldName}.coordinates`,
        `Longitude must be between -180 and 180`,
        'LONGITUDE_OUT_OF_RANGE'
      );
    }
  } else if (typeof coordinates === 'object' && coordinates !== null) {
    // Object format { lat, lng }
    const { lat, lng } = coordinates as { lat: number | null; lng: number | null };
    
    if (lat !== null && (typeof lat !== 'number' || lat < -90 || lat > 90)) {
      addError(
        errors,
        `${fieldName}.coordinates.lat`,
        `Latitude must be a number between -90 and 90`,
        'INVALID_LATITUDE'
      );
    }

    if (lng !== null && (typeof lng !== 'number' || lng < -180 || lng > 180)) {
      addError(
        errors,
        `${fieldName}.coordinates.lng`,
        `Longitude must be a number between -180 and 180`,
        'INVALID_LONGITUDE'
      );
    }
  } else {
    addError(
      errors,
      `${fieldName}.coordinates`,
      `Coordinates must be either [lat, lng] array or {lat, lng} object`,
      'INVALID_COORDINATES_FORMAT'
    );
  }
}

/**
 * Validate array of trip points
 */
export function validateTripPointArray(
  points: any,
  fieldName: string,
  maxCount: number,
  errors: ValidationError[]
): void {
  if (!Array.isArray(points)) {
    addError(errors, fieldName, `${fieldName} must be an array`, 'INVALID_ARRAY_TYPE');
    return;
  }

  if (points.length > maxCount) {
    addError(
      errors,
      fieldName,
      `Maximum ${maxCount} stops allowed`,
      'TOO_MANY_STOPS'
    );
    return;
  }

  points.forEach((point, index) => {
    validateTripPoint(point, `${fieldName}[${index}]`, errors);
  });
}

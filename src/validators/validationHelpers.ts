/**
 * Validation Helpers
 * Reusable validation utilities
 */

import { VehicleType } from '../types/pricing.types';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Helper to add validation error
 */
export function addError(
  errors: ValidationError[],
  field: string,
  message: string,
  code: string
): void {
  errors.push({ field, message, code });
}

/**
 * Check if vehicle type is valid
 */
export function isValidVehicleType(type: string): type is VehicleType {
  return Object.values(VehicleType).includes(type as VehicleType);
}

/**
 * Check if string is valid ISO 8601 date/time
 * More lenient than strict toISOString() equality
 */
export function isValidISODateTime(dateTime: string): boolean {
  if (typeof dateTime !== 'string' || dateTime.trim().length === 0) {
    return false;
  }
  
  const date = new Date(dateTime);
  return !isNaN(date.getTime());
}

/**
 * Check if return date is after outbound date
 */
export function isReturnDateValid(outboundDate: string, returnDate: string): boolean {
  const outbound = new Date(outboundDate);
  const returnTrip = new Date(returnDate);
  
  if (isNaN(outbound.getTime()) || isNaN(returnTrip.getTime())) {
    return false;
  }
  
  return returnTrip > outbound;
}

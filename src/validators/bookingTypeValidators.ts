/**
 * Booking Type Validators
 * Per-booking-type validation logic
 */

import { PricingRequestData, VehicleType, BookingType } from '../types/pricing.types';
import { ValidationError, addError, isValidVehicleType } from './validationHelpers';
import { validateTripPoint, validateTripPointArray } from './tripPointValidator';

/**
 * Validate ONE_WAY booking
 */
export function validateOneWay(
  request: PricingRequestData,
  errors: ValidationError[]
): void {
  // Vehicle type required
  if (!request.vehicleType) {
    addError(errors, 'vehicleType', 'Vehicle type is required for ONE_WAY bookings', 'MISSING_VEHICLE_TYPE');
  } else if (!isValidVehicleType(request.vehicleType)) {
    addError(errors, 'vehicleType', `Invalid vehicle type: ${request.vehicleType}`, 'INVALID_VEHICLE_TYPE');
  }

  // Pickup required
  if (!request.pickup) {
    addError(errors, 'pickup', 'Pickup location is required for ONE_WAY bookings', 'MISSING_PICKUP');
  } else {
    validateTripPoint(request.pickup, 'pickup', errors);
  }

  // Dropoff required
  if (!request.dropoff) {
    addError(errors, 'dropoff', 'Dropoff location is required for ONE_WAY bookings', 'MISSING_DROPOFF');
  } else {
    validateTripPoint(request.dropoff, 'dropoff', errors);
  }

  // Additional stops validation (optional)
  if (request.additionalStops != null) {
    validateTripPointArray(request.additionalStops, 'additionalStops', 5, errors);
  }
}

/**
 * Validate RETURN booking
 */
export function validateReturn(
  request: PricingRequestData,
  errors: ValidationError[]
): void {
  // Vehicle type required
  if (!request.vehicleType) {
    addError(errors, 'vehicleType', 'Vehicle type is required for RETURN bookings', 'MISSING_VEHICLE_TYPE');
  } else if (!isValidVehicleType(request.vehicleType)) {
    addError(errors, 'vehicleType', `Invalid vehicle type: ${request.vehicleType}`, 'INVALID_VEHICLE_TYPE');
  }

  // Outbound trip validation
  if (!request.pickup) {
    addError(errors, 'pickup', 'Outbound pickup location is required for RETURN bookings', 'MISSING_PICKUP');
  } else {
    validateTripPoint(request.pickup, 'pickup', errors);
  }

  if (!request.dropoff) {
    addError(errors, 'dropoff', 'Outbound dropoff location is required for RETURN bookings', 'MISSING_DROPOFF');
  } else {
    validateTripPoint(request.dropoff, 'dropoff', errors);
  }

  // Return trip validation
  if (!request.returnPickup) {
    addError(errors, 'returnPickup', 'Return pickup location is required for RETURN bookings', 'MISSING_RETURN_PICKUP');
  } else {
    validateTripPoint(request.returnPickup, 'returnPickup', errors);
  }

  if (!request.returnDropoff) {
    addError(errors, 'returnDropoff', 'Return dropoff location is required for RETURN bookings', 'MISSING_RETURN_DROPOFF');
  } else {
    validateTripPoint(request.returnDropoff, 'returnDropoff', errors);
  }

  // Additional stops validation (optional)
  if (request.additionalStops != null) {
    validateTripPointArray(request.additionalStops, 'additionalStops', 5, errors);
  }

  if (request.returnAdditionalStops != null) {
    validateTripPointArray(request.returnAdditionalStops, 'returnAdditionalStops', 5, errors);
  }
}

/**
 * Validate HOURLY booking
 */
export function validateHourly(
  request: PricingRequestData,
  errors: ValidationError[]
): void {
  // Vehicle type required
  if (!request.vehicleType) {
    addError(errors, 'vehicleType', 'Vehicle type is required for HOURLY bookings', 'MISSING_VEHICLE_TYPE');
  } else if (!isValidVehicleType(request.vehicleType)) {
    addError(errors, 'vehicleType', `Invalid vehicle type: ${request.vehicleType}`, 'INVALID_VEHICLE_TYPE');
  }

  // Hours required
  if (request.hours == null) {
    addError(errors, 'hours', 'Hours is required for HOURLY bookings', 'MISSING_HOURS');
  } else if (typeof request.hours !== 'number' || request.hours < 1 || request.hours > 24) {
    addError(errors, 'hours', 'Hours must be a number between 1 and 24', 'INVALID_HOURS_VALUE');
  }

  // Pickup required
  if (!request.pickup) {
    addError(errors, 'pickup', 'Pickup location is required for HOURLY bookings', 'MISSING_PICKUP');
  } else {
    validateTripPoint(request.pickup, 'pickup', errors);
  }

  // Dropoff optional for hourly (may return to same location)
  if (request.dropoff) {
    validateTripPoint(request.dropoff, 'dropoff', errors);
  }
}

/**
 * Validate DAILY booking
 */
export function validateDaily(
  request: PricingRequestData,
  errors: ValidationError[]
): void {
  // Vehicle type required
  if (!request.vehicleType) {
    addError(errors, 'vehicleType', 'Vehicle type is required for DAILY bookings', 'MISSING_VEHICLE_TYPE');
  } else if (!isValidVehicleType(request.vehicleType)) {
    addError(errors, 'vehicleType', `Invalid vehicle type: ${request.vehicleType}`, 'INVALID_VEHICLE_TYPE');
  }

  // Days required
  if (request.days == null) {
    addError(errors, 'days', 'Days is required for DAILY bookings', 'MISSING_DAYS');
  } else if (typeof request.days !== 'number' || request.days < 1 || request.days > 30) {
    addError(errors, 'days', 'Days must be a number between 1 and 30', 'INVALID_DAYS_VALUE');
  } else if (!Number.isInteger(request.days)) {
    addError(errors, 'days', 'Days must be a whole number (1, 2, 3, etc.) - no fractional days allowed', 'INVALID_DAYS_FRACTIONAL');
  }

  // Pickup required
  if (!request.pickup) {
    addError(errors, 'pickup', 'Pickup location is required for DAILY bookings', 'MISSING_PICKUP');
  } else {
    validateTripPoint(request.pickup, 'pickup', errors);
  }

  // Dropoff optional for daily (may return to same location)
  if (request.dropoff) {
    validateTripPoint(request.dropoff, 'dropoff', errors);
  }
}

/**
 * Validate FLEET booking
 */
export function validateFleet(
  request: PricingRequestData,
  errors: ValidationError[]
): void {
  // Fleet config required
  if (!request.fleetConfig) {
    addError(errors, 'fleetConfig', 'Fleet configuration is required for FLEET bookings', 'MISSING_FLEET_CONFIG');
  } else if (typeof request.fleetConfig !== 'object' || Array.isArray(request.fleetConfig)) {
    addError(errors, 'fleetConfig', 'Fleet configuration must be an object', 'INVALID_FLEET_CONFIG_TYPE');
  } else {
    // Validate fleet config structure
    const vehicleTypes = Object.keys(request.fleetConfig);

    if (vehicleTypes.length === 0) {
      addError(errors, 'fleetConfig', 'Fleet configuration must specify at least one vehicle type', 'EMPTY_FLEET_CONFIG');
    }

    let totalVehicles = 0;
    vehicleTypes.forEach((type) => {
      if (!isValidVehicleType(type as VehicleType)) {
        addError(errors, `fleetConfig.${type}`, `Invalid vehicle type in fleet config: ${type}`, 'INVALID_FLEET_VEHICLE_TYPE');
      }

      const count = request.fleetConfig![type as VehicleType];
      if (typeof count !== 'number' || count < 1 || count > 10) {
        addError(errors, `fleetConfig.${type}`, `Vehicle count must be between 1 and 10 for ${type}`, 'INVALID_FLEET_VEHICLE_COUNT');
      }

      totalVehicles += count || 0;
    });

    if (totalVehicles > 20) {
      addError(errors, 'fleetConfig', 'Total fleet size cannot exceed 20 vehicles', 'FLEET_TOO_LARGE');
    }
  }

  // Pickup required
  if (!request.pickup) {
    addError(errors, 'pickup', 'Pickup location is required for FLEET bookings', 'MISSING_PICKUP');
  } else {
    validateTripPoint(request.pickup, 'pickup', errors);
  }

  // Dropoff validation depends on baseServiceType
  // - Required for FLEET + ONE_WAY (route-based)
  // - Optional for FLEET + HOURLY/DAILY (service-based, chauffeur may stay at pickup)
  const baseServiceType = (request as any).baseServiceType;

  if (baseServiceType === BookingType.ONE_WAY) {
    // Dropoff required for FLEET + ONE_WAY
    if (!request.dropoff) {
      addError(errors, 'dropoff', 'Dropoff location is required for FLEET + ONE_WAY bookings', 'MISSING_DROPOFF');
    } else {
      validateTripPoint(request.dropoff, 'dropoff', errors);
    }
  } else {
    // Dropoff optional for FLEET + HOURLY/DAILY
    if (request.dropoff) {
      validateTripPoint(request.dropoff, 'dropoff', errors);
    }
  }

  // Additional stops validation (optional)
  if (request.additionalStops != null) {
    validateTripPointArray(request.additionalStops, 'additionalStops', 5, errors);
  }
}

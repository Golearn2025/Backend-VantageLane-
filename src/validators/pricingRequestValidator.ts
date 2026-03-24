/**
 * Pricing Request Validator
 * 
 * Main orchestrator for pricing request validation
 * Validates raw PricingRequestData before parsing
 * Ensures all required fields are present per booking type
 * Rejects BESPOKE booking type (out of scope for pricing engine)
 */

import {
  PricingRequestData,
  BookingType,
  PricingEngineBookingType,
} from '../types/pricing.types';
import {
  ValidationError,
  addError,
  isValidISODateTime,
  isReturnDateValid,
} from './validationHelpers';
import {
  validateOneWay,
  validateReturn,
  validateHourly,
  validateDaily,
  validateFleet,
} from './bookingTypeValidators';

export { ValidationError } from './validationHelpers';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Main validation function
 * Returns validation result with detailed errors
 */
export function validatePricingRequest(
  request: PricingRequestData
): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Validate booking type
  if (!request.bookingType) {
    addError(errors, 'bookingType', 'Booking type is required', 'MISSING_BOOKING_TYPE');
    return { valid: false, errors };
  }

  // 2. Reject BESPOKE (out of scope)
  if (request.bookingType === BookingType.BESPOKE) {
    addError(
      errors,
      'bookingType',
      'BESPOKE booking type not supported by pricing engine',
      'BESPOKE_NOT_SUPPORTED'
    );
    return { valid: false, errors };
  }

  // 3. Validate booking type is supported
  const supportedTypes: PricingEngineBookingType[] = [
    BookingType.ONE_WAY,
    BookingType.RETURN,
    BookingType.HOURLY,
    BookingType.DAILY,
    BookingType.FLEET,
  ];

  if (!supportedTypes.includes(request.bookingType as PricingEngineBookingType)) {
    addError(
      errors,
      'bookingType',
      `Invalid booking type: ${request.bookingType}`,
      'INVALID_BOOKING_TYPE'
    );
    return { valid: false, errors };
  }

  // 4. Validate dateTime
  if (!request.dateTime) {
    addError(errors, 'dateTime', 'DateTime is required', 'MISSING_DATETIME');
  } else if (!isValidISODateTime(request.dateTime)) {
    addError(
      errors,
      'dateTime',
      'DateTime must be valid ISO 8601 format',
      'INVALID_DATETIME_FORMAT'
    );
  }

  // 5. Validate returnDateTime for RETURN bookings
  if (request.bookingType === BookingType.RETURN) {
    if (!request.returnDateTime) {
      addError(
        errors,
        'returnDateTime',
        'Return date/time is required for RETURN bookings',
        'MISSING_RETURN_DATETIME'
      );
    } else if (!isValidISODateTime(request.returnDateTime)) {
      addError(
        errors,
        'returnDateTime',
        'Return date/time must be valid ISO 8601 format',
        'INVALID_RETURN_DATETIME_FORMAT'
      );
    } else if (request.dateTime && !isReturnDateValid(request.dateTime, request.returnDateTime)) {
      addError(
        errors,
        'returnDateTime',
        'Return date/time must be after outbound date/time',
        'RETURN_BEFORE_OUTBOUND'
      );
    }
  }

  // 6. Validate per booking type
  switch (request.bookingType) {
    case BookingType.ONE_WAY:
      validateOneWay(request, errors);
      break;
    case BookingType.RETURN:
      validateReturn(request, errors);
      break;
    case BookingType.HOURLY:
      validateHourly(request, errors);
      break;
    case BookingType.DAILY:
      validateDaily(request, errors);
      break;
    case BookingType.FLEET:
      validateFleet(request, errors);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


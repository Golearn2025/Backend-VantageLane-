/**
 * Config Controller - Vehicle types, booking types, etc.
 */

import { Request, Response } from 'express';
import { VehicleType, BookingType } from '../types/pricing.types';

export class ConfigController {

  /**
   * Get available vehicle types
   */
  public static getVehicleTypes(req: Request, res: Response): void {
    const vehicleTypes = Object.keys(VehicleType).map(key => ({
      id: VehicleType[key as keyof typeof VehicleType],
      name: VehicleType[key as keyof typeof VehicleType]
    }));

    res.json({
      success: true,
      data: vehicleTypes,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get available booking types
   */
  public static getBookingTypes(req: Request, res: Response): void {
    const bookingTypes = Object.keys(BookingType).map(key => ({
      id: BookingType[key as keyof typeof BookingType],
      name: BookingType[key as keyof typeof BookingType]
    }));

    res.json({
      success: true,
      data: bookingTypes,
      timestamp: new Date().toISOString()
    });
  }
}

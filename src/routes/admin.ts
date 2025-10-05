/**
 * Admin API Routes - for Admin Dashboard integration
 * Endpoints for managing pricing rules from Admin UI
 */

import express from 'express';
import { PRICING_CONFIG } from '../config/pricing.config';
import { VehicleType } from '../types/pricing.types';
import type { PricingConfig } from '../types/pricing.types';

const router = express.Router();

/**
 * GET /api/admin/pricing/rules
 * Returns current pricing configuration for Admin Dashboard
 */
router.get('/pricing/rules', (req, res) => {
  try {
    // Return current pricing config in Admin-friendly format
    const adminConfig = {
      vehicleRates: [
        {
          id: 'vr-executive',
          vehicleType: 'Executive',
          baseFare: PRICING_CONFIG.vehicles.executive.rates.base,
          mileRate1to6: PRICING_CONFIG.vehicles.executive.rates.perMile[0],
          mileRateOver6: PRICING_CONFIG.vehicles.executive.rates.perMile[1],
          perMinute: PRICING_CONFIG.vehicles.executive.rates.perMin,
          hourlyInTown: PRICING_CONFIG.vehicles.executive.rates.hourly[0],
          hourlyOutTown: PRICING_CONFIG.vehicles.executive.rates.hourly[1],
          minimumFare: PRICING_CONFIG.vehicles.executive.rates.minimum,
          isActive: true,
        },
        {
          id: 'vr-luxury',
          vehicleType: 'Luxury',
          baseFare: PRICING_CONFIG.vehicles.luxury.rates.base,
          mileRate1to6: PRICING_CONFIG.vehicles.luxury.rates.perMile[0],
          mileRateOver6: PRICING_CONFIG.vehicles.luxury.rates.perMile[1],
          perMinute: PRICING_CONFIG.vehicles.luxury.rates.perMin,
          hourlyInTown: PRICING_CONFIG.vehicles.luxury.rates.hourly[0],
          hourlyOutTown: PRICING_CONFIG.vehicles.luxury.rates.hourly[1],
          minimumFare: PRICING_CONFIG.vehicles.luxury.rates.minimum,
          isActive: true,
        },
        {
          id: 'vr-suv',
          vehicleType: 'SUV',
          baseFare: PRICING_CONFIG.vehicles.suv.rates.base,
          mileRate1to6: PRICING_CONFIG.vehicles.suv.rates.perMile[0],
          mileRateOver6: PRICING_CONFIG.vehicles.suv.rates.perMile[1],
          perMinute: PRICING_CONFIG.vehicles.suv.rates.perMin,
          hourlyInTown: PRICING_CONFIG.vehicles.suv.rates.hourly[0],
          hourlyOutTown: PRICING_CONFIG.vehicles.suv.rates.hourly[1],
          minimumFare: PRICING_CONFIG.vehicles.suv.rates.minimum,
          isActive: true,
        },
        {
          id: 'vr-van',
          vehicleType: 'Van/MPV',
          baseFare: PRICING_CONFIG.vehicles.van.rates.base,
          mileRate1to6: PRICING_CONFIG.vehicles.van.rates.perMile[0],
          mileRateOver6: PRICING_CONFIG.vehicles.van.rates.perMile[1],
          perMinute: PRICING_CONFIG.vehicles.van.rates.perMin,
          hourlyInTown: PRICING_CONFIG.vehicles.van.rates.hourly[0],
          hourlyOutTown: PRICING_CONFIG.vehicles.van.rates.hourly[1],
          minimumFare: PRICING_CONFIG.vehicles.van.rates.minimum,
          isActive: true,
        },
      ],
      timeMultipliers: [
        {
          id: 'tm-day-normal',
          name: 'Day Normal',
          multiplier: PRICING_CONFIG.multipliers.time.day,
          startTime: '06:00',
          endTime: '22:00',
          days: 'Mon-Fri',
          isActive: true,
        },
        {
          id: 'tm-night',
          name: 'Night',
          multiplier: PRICING_CONFIG.multipliers.time.night,
          startTime: '22:00',
          endTime: '06:00',
          days: 'All Days',
          isActive: true,
        },
        {
          id: 'tm-peak-morning',
          name: 'Peak Morning',
          multiplier: PRICING_CONFIG.multipliers.time.peak_morning,
          startTime: '07:00',
          endTime: '09:00',
          days: 'Mon-Fri',
          isActive: true,
        },
        {
          id: 'tm-peak-evening',
          name: 'Peak Evening',
          multiplier: PRICING_CONFIG.multipliers.time.peak_evening,
          startTime: '17:00',
          endTime: '19:00',
          days: 'Mon-Fri',
          isActive: true,
        },
        {
          id: 'tm-weekend',
          name: 'Weekend',
          multiplier: PRICING_CONFIG.multipliers.time.weekend,
          startTime: '-',
          endTime: '-',
          days: 'Sat-Sun',
          isActive: true,
        },
      ],
      airportFees: [
        {
          id: 'af-lhr',
          airportCode: 'LHR',
          airportName: 'London Heathrow',
          pickupFee: PRICING_CONFIG.zones.airports.LHR.fee,
          dropoffFee: PRICING_CONFIG.zones.airports.LHR.fee,
          freeWaitMinutes: PRICING_CONFIG.zones.airports.LHR.wait,
          isActive: true,
        },
        {
          id: 'af-lgw',
          airportCode: 'LGW',
          airportName: 'London Gatwick',
          pickupFee: PRICING_CONFIG.zones.airports.LGW.fee,
          dropoffFee: PRICING_CONFIG.zones.airports.LGW.fee,
          freeWaitMinutes: PRICING_CONFIG.zones.airports.LGW.wait,
          isActive: true,
        },
        {
          id: 'af-stn',
          airportCode: 'STN',
          airportName: 'London Stansted',
          pickupFee: PRICING_CONFIG.zones.airports.STN.fee,
          dropoffFee: PRICING_CONFIG.zones.airports.STN.fee,
          freeWaitMinutes: PRICING_CONFIG.zones.airports.STN.wait,
          isActive: true,
        },
        {
          id: 'af-ltn',
          airportCode: 'LTN',
          airportName: 'London Luton',
          pickupFee: PRICING_CONFIG.zones.airports.LTN.fee,
          dropoffFee: PRICING_CONFIG.zones.airports.LTN.fee,
          freeWaitMinutes: PRICING_CONFIG.zones.airports.LTN.wait,
          isActive: true,
        },
        {
          id: 'af-lcy',
          airportCode: 'LCY',
          airportName: 'London City',
          pickupFee: PRICING_CONFIG.zones.airports.LCY.fee,
          dropoffFee: PRICING_CONFIG.zones.airports.LCY.fee,
          freeWaitMinutes: PRICING_CONFIG.zones.airports.LCY.wait,
          isActive: true,
        },
      ],
      zoneFees: [
        {
          id: 'zf-central',
          zoneName: 'Central London',
          feeAmount: PRICING_CONFIG.zones.congestion.central,
          zoneType: 'Congestion',
          isActive: true,
        },
        {
          id: 'zf-ulez',
          zoneName: 'ULEZ',
          feeAmount: PRICING_CONFIG.zones.congestion.ulez,
          zoneType: 'ULEZ',
          isActive: true,
        },
        {
          id: 'zf-lez',
          zoneName: 'LEZ',
          feeAmount: PRICING_CONFIG.zones.congestion.lez,
          zoneType: 'LEZ',
          isActive: true,
        },
        {
          id: 'zf-dartford',
          zoneName: 'Dartford Crossing',
          feeAmount: PRICING_CONFIG.zones.tolls.dartford,
          zoneType: 'Toll',
          isActive: true,
        },
        {
          id: 'zf-m6',
          zoneName: 'M6 Toll',
          feeAmount: PRICING_CONFIG.zones.tolls.m6,
          zoneType: 'Toll',
          isActive: true,
        },
      ],
    };

    res.json({
      success: true,
      data: adminConfig,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error fetching pricing rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing rules',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/admin/pricing/update
 * Updates pricing configuration from Admin Dashboard
 */
router.post('/pricing/update', async (req, res) => {
  try {
    const { type, data } = req.body;

    console.log(`📊 Admin updating pricing: ${type}`, data);

    // Update in-memory configuration based on type
    if (type === 'vehicleRate' && data) {
      const vehicleMap: { [key: string]: VehicleType } = {
        'vr-executive': VehicleType.EXECUTIVE,
        'vr-luxury': VehicleType.LUXURY, 
        'vr-suv': VehicleType.SUV,
        'vr-van': VehicleType.VAN
      };
      
      const vehicleKey = vehicleMap[data.id];
      if (vehicleKey && PRICING_CONFIG.vehicles[vehicleKey]) {
        const vehicle = PRICING_CONFIG.vehicles[vehicleKey];
        // Update the in-memory config
        vehicle.rates.base = data.baseFare || vehicle.rates.base;
        vehicle.rates.perMile[0] = data.mileRate1to6 || vehicle.rates.perMile[0];
        vehicle.rates.perMile[1] = data.mileRateOver6 || vehicle.rates.perMile[1];
        vehicle.rates.perMin = data.perMinute || vehicle.rates.perMin;
        vehicle.rates.hourly[0] = data.hourlyInTown || vehicle.rates.hourly[0];
        vehicle.rates.hourly[1] = data.hourlyOutTown || vehicle.rates.hourly[1];
        vehicle.rates.minimum = data.minimumFare || vehicle.rates.minimum;
        
        console.log(`✅ Updated ${vehicleKey} pricing:`, vehicle.rates);
      }
    }
    
    // For other types (timeMultiplier, airportFee, etc.) - can be implemented similarly
    
    res.json({
      success: true,
      message: `Pricing ${type} updated successfully in memory`,
      data: data,
      updated_config: type === 'vehicleRate' ? PRICING_CONFIG.vehicles : 'Other types not yet implemented',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error updating pricing rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update pricing rules',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/admin/health
 * Health check for Admin Dashboard
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Admin API',
    status: 'healthy',
    backend_version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;

/**
 * Admin API Routes - for Admin Dashboard integration
 * Endpoints for managing pricing rules from Admin UI
 */

import express from 'express';
import { PRICING_CONFIG } from '../config/pricing.config';

// Types for custom pricing items
interface CustomVehicleRate {
  id: string;
  vehicleType: string;
  baseFare: number;
  mileRate1to6: number;
  mileRateOver6: number;
  perMinute: number;
  hourlyInTown: number;
  hourlyOutTown: number;
  minimumFare: number;
  isActive: boolean;
}

interface CustomTimeMultiplier {
  id: string;
  name: string;
  multiplier: number;
  startTime: string;
  endTime: string;
  days: string;
  isActive: boolean;
}

interface CustomAirportFee {
  id: string;
  airportCode: string;
  airportName: string;
  pickupFee: number;
  dropoffFee: number;
  freeWaitMinutes: number;
  isActive: boolean;
}

interface CustomZoneFee {
  id: string;
  zoneName: string;
  feeAmount: number;
  zoneType: string;
  isActive: boolean;
}

import fs from 'fs';
import path from 'path';

// JSON storage file path
const STORAGE_FILE = path.join(__dirname, '../data/custom-pricing.json');

// Initialize storage directory
const ensureStorageDir = (): void => {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Load data from JSON file
const loadCustomData = (): {
  vehicleRates: CustomVehicleRate[];
  timeMultipliers: CustomTimeMultiplier[];  
  airportFees: CustomAirportFee[];
  zoneFees: CustomZoneFee[];
} => {
  ensureStorageDir();
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      return {
        vehicleRates: data.vehicleRates || [],
        timeMultipliers: data.timeMultipliers || [],
        airportFees: data.airportFees || [],
        zoneFees: data.zoneFees || []
      };
    }
  } catch (error) {
    console.error('Error loading custom pricing data:', error);
  }
  return { vehicleRates: [], timeMultipliers: [], airportFees: [], zoneFees: [] };
};

// Save data to JSON file
const saveCustomData = (): void => {
  ensureStorageDir();
  try {
    const data = {
      vehicleRates: customVehicleRates,
      timeMultipliers: customTimeMultipliers,
      airportFees: customAirportFees,
      zoneFees: customZoneFees,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Custom pricing data saved to disk');
  } catch (error) {
    console.error('❌ Error saving custom pricing data:', error);
  }
};

// Additional types for hourly packages
interface HourlyPackage {
  id: string;
  duration: string;
  hours: number;
  basePrice: number;
  popular?: boolean;
  features: string[];
  ideal: string;
  vehicleMultipliers: {
    executive: number;
    luxury: number;
    van: number;
    suv: number;
  };
  isActive: boolean;
}

// Load custom data on startup  
const initialData = loadCustomData();
let customVehicleRates: CustomVehicleRate[] = initialData.vehicleRates;
let customTimeMultipliers: CustomTimeMultiplier[] = initialData.timeMultipliers;
let customAirportFees: CustomAirportFee[] = initialData.airportFees;
let customZoneFees: CustomZoneFee[] = initialData.zoneFees;

// Default hourly packages (migrare din landing page)
let hourlyPackages: HourlyPackage[] = [
  {
    id: 'hourly-2h',
    duration: '2 Hours Minimum',
    hours: 2,
    basePrice: 120,
    features: [
      'Professional chauffeur',
      '2 hours of service',
      'Unlimited stops within London',
      '30 minutes waiting time included',
      'Meet & greet service'
    ],
    ideal: 'Perfect for business meetings, quick shopping trips, or short city tours',
    vehicleMultipliers: { executive: 1.0, luxury: 1.17, van: 0.83, suv: 1.08 },
    isActive: true
  },
  {
    id: 'hourly-4h',
    duration: 'Half Day Package',
    hours: 4,
    basePrice: 200,
    features: [
      '4 hours of dedicated service',
      'Professional chauffeur',
      'Unlimited stops and waiting time',
      'Complimentary refreshments',
      'Wi-Fi and charging ports'
    ],
    ideal: 'Great for extended business tours, shopping expeditions, or half-day sightseeing',
    vehicleMultipliers: { executive: 1.0, luxury: 1.17, van: 0.83, suv: 1.08 },
    isActive: true
  },
  {
    id: 'hourly-8h',
    duration: 'Full Day Package',
    hours: 8,
    basePrice: 350,
    popular: true,
    features: [
      '8 hours of comprehensive service',
      'Premium luxury vehicle',
      'Experienced London chauffeur',
      'All-day availability',
      'Multiple stops included',
      'Executive travel experience'
    ],
    ideal: 'Perfect for full day business tours, comprehensive sightseeing, or special occasions',
    vehicleMultipliers: { executive: 1.0, luxury: 1.17, van: 0.83, suv: 1.08 },
    isActive: true
  },
  {
    id: 'hourly-12h',
    duration: 'Extended Package',
    hours: 12,
    basePrice: 500,
    features: [
      '12 hours of luxury service',
      'Premium executive vehicle',
      'Dedicated professional chauffeur',
      'Extended availability',
      'All stops and waiting included',
      'VIP treatment throughout'
    ],
    ideal: 'Ideal for corporate events, extended tours, or full-day executive requirements',
    vehicleMultipliers: { executive: 1.0, luxury: 1.17, van: 0.83, suv: 1.08 },
    isActive: true
  }
];

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
        // Add custom vehicle rates
        ...customVehicleRates,
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
        // Add custom time multipliers  
        ...customTimeMultipliers,
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
        // Add custom airport fees
        ...customAirportFees,
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
        // Add custom zone fees
        ...customZoneFees,
      ],
      hourlyPackages: hourlyPackages,
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

    // Reset arrays if they contain invalid data (cleanup)
    customTimeMultipliers = customTimeMultipliers.filter(item => 
      item.name && item.multiplier !== undefined && item.startTime && item.endTime && item.days
    );
    customAirportFees = customAirportFees.filter(item => 
      item.airportCode && item.airportName && item.pickupFee !== undefined
    );
    customZoneFees = customZoneFees.filter(item => 
      item.zoneName && item.feeAmount !== undefined && item.zoneType
    );

    // Update in-memory configuration based on type
    if (type === 'vehicleRate' && data) {
      const vehicleMap: { [key: string]: string } = {
        'vr-executive': 'executive',
        'vr-luxury': 'luxury', 
        'vr-suv': 'suv',
        'vr-van': 'van'
      };
      
      const vehicleKey = vehicleMap[data.id];
      if (vehicleKey && (PRICING_CONFIG.vehicles as any)[vehicleKey]) {
        // Update existing vehicle rate
        const vehicle = (PRICING_CONFIG.vehicles as any)[vehicleKey];
        vehicle.rates.base = data.baseFare || vehicle.rates.base;
        vehicle.rates.perMile[0] = data.mileRate1to6 || vehicle.rates.perMile[0];
        vehicle.rates.perMile[1] = data.mileRateOver6 || vehicle.rates.perMile[1];
        vehicle.rates.perMin = data.perMinute || vehicle.rates.perMin;
        vehicle.rates.hourly[0] = data.hourlyInTown || vehicle.rates.hourly[0];
        vehicle.rates.hourly[1] = data.hourlyOutTown || vehicle.rates.hourly[1];
        vehicle.rates.minimum = data.minimumFare || vehicle.rates.minimum;
        
        console.log(`✅ Updated ${vehicleKey} pricing:`, vehicle.rates);
      } else {
        // Add new custom vehicle rate
        const newRate = {
          id: data.id,
          vehicleType: data.vehicleType,
          baseFare: data.baseFare,
          mileRate1to6: data.mileRate1to6,
          mileRateOver6: data.mileRateOver6,
          perMinute: data.perMinute,
          hourlyInTown: data.hourlyInTown,
          hourlyOutTown: data.hourlyOutTown,
          minimumFare: data.minimumFare,
          isActive: data.isActive !== undefined ? data.isActive : true,
        };
        
        // Remove existing item with same ID if exists
        customVehicleRates = customVehicleRates.filter(item => item.id !== data.id);
        // Add new item
        customVehicleRates.push(newRate);
        // Save to disk
        saveCustomData();
        
        console.log(`✅ Added new vehicle rate:`, newRate);
      }
    }
    
    // Handle other types
    if (type === 'timeMultiplier' && data) {
      const newMultiplier: CustomTimeMultiplier = {
        id: data.id || `tm-custom-${Date.now()}`,
        name: data.name || 'Custom Multiplier',
        multiplier: data.multiplier || 1.0,
        startTime: data.startTime || '00:00',
        endTime: data.endTime || '23:59',
        days: data.days || 'All Days',
        isActive: data.isActive !== undefined ? data.isActive : true,
      };
      
      customTimeMultipliers = customTimeMultipliers.filter(item => item.id !== data.id);
      customTimeMultipliers.push(newMultiplier);
      saveCustomData();
      console.log(`✅ Added/updated time multiplier:`, newMultiplier);
    }
    
    if (type === 'airportFee' && data) {
      const newFee: CustomAirportFee = {
        id: data.id || `af-custom-${Date.now()}`,
        airportCode: data.airportCode || 'XXX',
        airportName: data.airportName || 'Custom Airport',
        pickupFee: data.pickupFee || 0,
        dropoffFee: data.dropoffFee || 0,
        freeWaitMinutes: data.freeWaitMinutes || 30,
        isActive: data.isActive !== undefined ? data.isActive : true,
      };
      
      customAirportFees = customAirportFees.filter(item => item.id !== data.id);
      customAirportFees.push(newFee);
      saveCustomData();
      console.log(`✅ Added/updated airport fee:`, newFee);
    }
    
    if (type === 'zoneFee' && data) {
      const newFee: CustomZoneFee = {
        id: data.id || `zf-custom-${Date.now()}`,
        zoneName: data.zoneName || 'Custom Zone',
        feeAmount: data.feeAmount || 0,
        zoneType: data.zoneType || 'Custom',
        isActive: data.isActive !== undefined ? data.isActive : true,
      };
      
      customZoneFees = customZoneFees.filter(item => item.id !== data.id);
      customZoneFees.push(newFee);
      saveCustomData();
      console.log(`✅ Added/updated zone fee:`, newFee);
    }
    
    if (type === 'hourlyPackage' && data) {
      const updatedPackage: HourlyPackage = {
        id: data.id || `hp-custom-${Date.now()}`,
        duration: data.duration || 'Custom Package',
        hours: data.hours || 4,
        basePrice: data.basePrice || 200,
        popular: data.popular || false,
        features: data.features || [],
        ideal: data.ideal || 'Custom hourly package',
        vehicleMultipliers: {
          executive: data.vehicleMultipliers?.executive || 1.0,
          luxury: data.vehicleMultipliers?.luxury || 1.17,
          van: data.vehicleMultipliers?.van || 0.83,
          suv: data.vehicleMultipliers?.suv || 1.08,
        },
        isActive: data.isActive !== undefined ? data.isActive : true,
      };
      
      hourlyPackages = hourlyPackages.filter(item => item.id !== data.id);
      hourlyPackages.push(updatedPackage);
      saveCustomData();
      console.log(`✅ Added/updated hourly package:`, updatedPackage);
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

/**
 * GET /api/admin/pricing/hourly-packages
 * Returns hourly packages for landing page consumption
 */
router.get('/pricing/hourly-packages', (req, res) => {
  try {
    const vehicleType = req.query.vehicle as string || 'executive';
    
    // Map vehicle types
    const vehicleMapping: {[key: string]: keyof HourlyPackage['vehicleMultipliers']} = {
      'executive': 'executive',
      'lux': 'luxury', 
      'luxury': 'luxury',
      'van': 'van',
      'suv': 'suv',
      'mpv': 'suv'
    };
    
    const mappedVehicleType = vehicleMapping[vehicleType] || 'executive';
    
    // Calculate prices for the requested vehicle type
    const packages = hourlyPackages.filter(pkg => pkg.isActive).map(pkg => {
      const multiplier = pkg.vehicleMultipliers[mappedVehicleType];
      const finalPrice = Math.round(pkg.basePrice * multiplier);
      
      return {
        id: pkg.id,
        duration: pkg.duration,
        hours: pkg.hours,
        price: `£${finalPrice}`,
        popular: pkg.popular || false,
        features: pkg.features,
        ideal: pkg.ideal,
        basePrice: pkg.basePrice,
        multiplier: multiplier,
        finalPrice: finalPrice
      };
    });
    
    res.json({
      success: true,
      data: {
        vehicleType: vehicleType,
        packages: packages
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Error fetching hourly packages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hourly packages',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

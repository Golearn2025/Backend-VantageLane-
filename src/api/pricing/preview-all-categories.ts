/**
 * Preview prices for all vehicle categories at once
 *
 * - Pure calculation, zero DB writes (no quote created)
 * - Used by frontend accordion to show real prices before vehicle selection
 */

import { Request, Response } from 'express';
import { PricingEngine } from '../../services/PricingEngine';
import { parsePricingRequest } from '../../parsers/pricingRequestParser';
import { VehicleType } from '../../types/pricing.types';

const ALL_VEHICLE_TYPES = [
  VehicleType.EXECUTIVE,
  VehicleType.LUXURY,
  VehicleType.SUV,
  VehicleType.MPV,
];

export async function previewAllCategories(req: Request, res: Response) {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required - organization ID missing',
      });
    }

    // Calculate prices for all vehicle types in parallel
    const results = await Promise.allSettled(
      ALL_VEHICLE_TYPES.map(async vehicleType => {
        const requestData = {
          ...req.body,
          vehicleType,
          organizationId,
        };

        const parseResult = parsePricingRequest(requestData);
        if (!parseResult.success || !parseResult.data) {
          throw new Error(`Parse failed for ${vehicleType}: ${JSON.stringify(parseResult.errors)}`);
        }

        const pricingResult = await PricingEngine.calculate(parseResult.data);
        if (!pricingResult.success || pricingResult.finalPrice == null) {
          throw new Error(`Pricing failed for ${vehicleType}`);
        }

        return { vehicleType, price: pricingResult.finalPrice, currency: pricingResult.currency || 'GBP' };
      })
    );

    const prices: Record<string, number | null> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        prices[result.value.vehicleType] = result.value.price;
      } else {
        // Extract vehicleType from the index to mark as null
        const idx = results.indexOf(result);
        prices[ALL_VEHICLE_TYPES[idx]] = null;
        console.error(`⚠️ Preview pricing failed for ${ALL_VEHICLE_TYPES[idx]}:`, result.reason);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        prices,
        currency: 'GBP',
      },
    });
  } catch (error) {
    console.error('❌ Error in previewAllCategories:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

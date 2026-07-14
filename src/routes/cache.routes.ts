/**
 * Cache Management Routes
 * Admin endpoints for cache invalidation
 */

import express, { Request, Response } from 'express';
import { PricingDataService } from '../services/PricingDataService';
import { OrganizationSettingsService } from '../services/OrganizationSettingsService';
import { OrganizationFinancialSettingsService } from '../services/OrganizationFinancialSettingsService';

const router = express.Router();

/**
 * POST /api/cache/invalidate
 * Invalidate pricing data cache
 * Called from Admin Panel after pricing updates
 */
router.post('/invalidate', (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body;
    
    PricingDataService.invalidateCache();
    OrganizationSettingsService.invalidateCache(organizationId);
    OrganizationFinancialSettingsService.invalidateCache(organizationId);
    
    res.json({
      success: true,
      message: 'Pricing data cache invalidated successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate cache',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/cache/status
 * Get cache status (for monitoring/debugging)
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const pricingStatus = PricingDataService.getCacheStatus();
    
    res.json({
      success: true,
      data: {
        pricing_data: pricingStatus
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting cache status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache status',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

/**
 * Cache Management Routes
 * Admin endpoints for cache invalidation
 */

import express, { Request, Response } from 'express';
import { PricingConfigService } from '../services/PricingConfigService';

const router = express.Router();

/**
 * POST /api/cache/invalidate
 * Invalidate pricing config cache
 * Called from Admin Panel after pricing updates
 */
router.post('/invalidate', (req: Request, res: Response) => {
  try {
    PricingConfigService.invalidateCache();
    
    res.json({
      success: true,
      message: 'Pricing config cache invalidated successfully',
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
    const status = PricingConfigService.getCacheStatus();
    
    res.json({
      success: true,
      data: status,
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

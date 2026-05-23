/**
 * Catalog Controller — read-only service_items for website checkout (local/dev).
 */

import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

export interface CatalogServiceItem {
  id: string;
  name: string;
  price_pence: number;
  item_group: string | null;
  pricing_mode: string | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
}

export class CatalogController {
  /**
   * @route GET /catalog/service-items
   * @desc Active service_items catalog (DB single source of truth)
   * @access Public (read-only)
   */
  public static async getServiceItems(req: Request, res: Response): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('service_items')
        .select('id, name, price_pence, item_group, pricing_mode, metadata, is_active')
        .eq('is_active', true)
        .order('item_group', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        console.error('[CatalogController] service_items error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.json({
        success: true,
        data: (data ?? []) as CatalogServiceItem[],
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[CatalogController] unexpected error:', err);
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

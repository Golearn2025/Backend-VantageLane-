/**
 * Catalog routes — DB-driven service_items (read-only, local/dev friendly).
 */

import { Router } from 'express';
import { CatalogController } from '../controllers/CatalogController';

const router = Router();

/**
 * @route GET /catalog/service-items
 * @desc Active service_items from DB
 * @access Public
 */
router.get('/service-items', CatalogController.getServiceItems);

export default router;

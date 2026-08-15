/**
 * Organization Auth Middleware
 * Injects organization context from DEFAULT_ORGANIZATION_ID env var.
 * Works in all environments (development + production).
 * Full JWT-based auth can replace this in future without changing endpoint logic.
 */

import { Request, Response, NextFunction } from 'express';

const DEFAULT_ORG_ID = process.env.DEFAULT_ORGANIZATION_ID || '9a5caade-4791-4860-93b5-12b1c4fa9830';

export function devAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Allow callers to select a specific rate card via pricingOrgId in the request body.
  // Falls back to the platform default (Vantage Lane) when not provided.
  const pricingOrgId = (req as any).body?.pricingOrgId as string | undefined;
  (req as any).user = {
    organizationId: pricingOrgId || DEFAULT_ORG_ID,
    id: 'system',
    email: 'system@vantage-lane.com',
  };

  next();
}

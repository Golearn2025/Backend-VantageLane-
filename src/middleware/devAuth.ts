/**
 * Organization Auth Middleware
 * Injects organization context from DEFAULT_ORGANIZATION_ID env var.
 * Works in all environments (development + production).
 * Full JWT-based auth can replace this in future without changing endpoint logic.
 */

import { Request, Response, NextFunction } from 'express';

const DEFAULT_ORG_ID = process.env.DEFAULT_ORGANIZATION_ID || '9a5caade-4791-4860-93b5-12b1c4fa9830';

export function devAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const organizationId =
    (req.headers['x-organization-id'] as string) || DEFAULT_ORG_ID;

  (req as any).user = {
    organizationId,
    id: 'system',
    email: 'system@vantage-lane.com',
  };

  next();
}

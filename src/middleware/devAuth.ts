/**
 * Development Authentication Middleware
 * Adds mock auth context for development testing
 */

import { Request, Response, NextFunction } from 'express';

export function devAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only in development environment
  if (process.env.NODE_ENV === 'development') {
    // Add mock user with organization ID for testing
    (req as any).user = {
      organizationId: '9a5caade-4791-4860-93b5-12b1c4fa9830',
      id: 'test-user-id',
      email: 'test@example.com'
    };
    
    console.log('🔓 Development auth middleware applied - mock user context added');
  }
  
  next();
}

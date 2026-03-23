/**
 * Main server file - TypeScript implementation
 * Clean, professional Express server setup
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';

// Import middleware
import { devAuthMiddleware } from './middleware/devAuth';

// Load environment variables
config();

// Import routes
import pricingRoutes from './routes/pricing';
import configRoutes from './routes/config';
import bookingRoutes from './routes/booking';
import cacheRoutes from './routes/cache.routes';
import stripeRoutes from './routes/stripe';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['https://your-frontend-domain.com'])
    : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:51997', // Windsurf browser preview
      /^http:\/\/127\.0\.0\.1:\d+$/, // Any localhost port
      /^http:\/\/localhost:\d+$/ // Any localhost port
    ],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});

app.use('/api/', limiter);

// Stripe webhook needs raw body for signature verification (MUST be before JSON parsing)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Body parsing middleware (EXCEPT for Stripe webhooks)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Development auth middleware (only in development)
app.use('/api/pricing/calculate-and-quote', devAuthMiddleware);
app.use('/api/pricing/convert-quote-to-booking', devAuthMiddleware);

// API Routes
app.use('/api/pricing', pricingRoutes);
app.use('/api/config', configRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/cache', cacheRoutes);
app.use('/api/stripe', stripeRoutes);

// Root endpoint
app.get('/', (req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    message: 'Vantage Lane Pricing Backend API',
    version: '1.0.0',
    endpoints: {
      pricing: '/api/pricing',
      config: '/api/config',
      booking: '/api/booking',
      cache: '/api/cache',
      stripe: '/api/stripe'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req: express.Request, res: express.Response) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    service: 'Vantage Lane Pricing Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚗 Vantage Lane Pricing Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💰 Pricing API: http://localhost:${PORT}/api/pricing`);
  console.log(`⚙️  Config API: http://localhost:${PORT}/api/config`);
  console.log(`📋 Booking API: http://localhost:${PORT}/api/booking`);
  console.log(`� Cache API: http://localhost:${PORT}/api/cache`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

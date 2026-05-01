const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const Sentry = require('@sentry/node');
const logger = require('./utils/logger');

const authTenantRoutes  = require('./routes/authTenant');
const tenantRoutes      = require('./routes/tenant');
const appointmentRoutes = require('./routes/appointments');
const conversationRoutes= require('./routes/conversations');
const serviceRoutes     = require('./routes/services');
const emailRoutes       = require('./routes/email');
const billingRoutes     = require('./routes/billing');
const analyticsRoutes   = require('./routes/analytics');
const errorHandler      = require('./middleware/errorHandler');
const authRateLimiter   = require('./middleware/authRateLimiter');

const WILDCARD_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?myclinicaccess\.com$/;

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // non-browser / server-to-server
    if (
      origin === 'http://localhost:5173' ||
      origin === 'http://localhost:5174' ||
      WILDCARD_ORIGIN.test(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const app = express();

// Request logging (skip health checks to reduce noise)
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/health' },
}));

// CORS
app.use(cors(corsOptions));


app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(self)'
  );
  next();
});

// Rate limiting — global: 300 req/15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
}));

// Body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'custom-clinic-portal-api' }));

// Billing webhook needs raw body — mount before json() body parser runs on it
app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }));

// Routes — all under /api/v1/
app.use('/api/v1/auth-tenant',   authRateLimiter, authTenantRoutes);
app.use('/api/v1/tenants',       tenantRoutes);
app.use('/api/v1/appointments',  appointmentRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/services',      serviceRoutes);
app.use('/api/v1/email',         emailRoutes);
app.use('/api/v1/billing',       billingRoutes);
app.use('/api/v1/analytics',     analyticsRoutes);

// Sentry error handler (must come before custom errorHandler)
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Centralized error handler
app.use(errorHandler);

module.exports = app;

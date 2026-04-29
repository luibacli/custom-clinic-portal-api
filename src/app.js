const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authTenantRoutes  = require('./routes/authTenant');
const tenantRoutes      = require('./routes/tenant');
const appointmentRoutes = require('./routes/appointments');
const conversationRoutes= require('./routes/conversations');
const serviceRoutes     = require('./routes/services');
const emailRoutes       = require('./routes/email');
const errorHandler      = require('./middleware/errorHandler');

const ALLOWED_ORIGINS = [
  'https://careboard.dev',
  'https://myclinicaccess.com',
  'https://www.myclinicaccess.com',
  'https://staging.myclinicaccess.com',
  'https://uat.myclinicaccess.com',
  'https://demo.clinicaccess.com',
  'https://primawellmc.com',
  'https://www.primawellmc.com',
  'https://dongonmc.com',
  'https://www.dongonmc.com',
  'http://localhost:5173',
  'http://localhost:5174',
];

const app = express();

// CORS
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));

// Rate limiting — global: 300 req/15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
}));

// Tighter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

// Body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'custom-clinic-portal-api' }));

// Routes
app.use('/api/auth-tenant',   authLimiter, authTenantRoutes);
app.use('/api/tenants',       tenantRoutes);
app.use('/api/appointments',  appointmentRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/services',      serviceRoutes);
app.use('/api/email',         emailRoutes);

// Centralized error handler
app.use(errorHandler);

module.exports = app;

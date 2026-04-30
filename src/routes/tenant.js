const express      = require('express');
const rateLimit    = require('express-rate-limit');
const router       = express.Router();
const auth         = require('../middleware/auth');
const uploadCloudinary = require('../middleware/uploadCloudinary');
const {
  registerClinic,
  resolveTenantByHost,
  fetchAllTenants,
  fetchTenant,
  createTenant,
  updateTenant,
  uploadLogo,
  deleteTenant,
  updateTenantBranding,
  updateTenantFeatures,
  updateSubscription,
} = require('../controllers/tenantController');

// Strict limiter — 5 signups per hour per IP
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many signup attempts. Please try again in an hour.' },
});

// Public — self-service clinic registration
router.post('/register', signupLimiter, registerClinic);
router.get('/resolve',         resolveTenantByHost);
router.get('/',                   auth(['dev', 'superadmin']),         fetchAllTenants);
router.get('/:id',                auth(),                              fetchTenant);
router.post('/create',            auth(['dev']),                       createTenant);
router.put('/:id/update',         auth(['dev']),                       updateTenant);
router.patch('/:id/branding',     auth(['dev', 'superadmin']),         updateTenantBranding);
router.patch('/:id/features',     auth(['dev']),                       updateTenantFeatures);
router.patch('/:id/logo',         auth(['dev', 'superadmin']),         uploadCloudinary.single('image'), uploadLogo);
router.patch('/:id/subscription', auth(['dev']),                       updateSubscription);
router.delete('/:id',             auth(['dev']),                       deleteTenant);

module.exports = router;

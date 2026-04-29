const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
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
} = require('../controllers/tenantController');

// Public — self-service clinic registration
router.post('/register',       registerClinic);
router.get('/resolve',         resolveTenantByHost);
router.get('/',                auth(['dev', 'superadmin']), fetchAllTenants);
router.get('/:id',             auth(), fetchTenant);
router.post('/create',         auth(), createTenant);
router.put('/:id/update',      auth(), updateTenant);
router.patch('/:id/branding',  auth(), updateTenantBranding);
router.patch('/:id/features',  auth(), updateTenantFeatures);
router.patch('/:id/logo',      auth(), uploadCloudinary.single('image'), uploadLogo);
router.delete('/:id',          auth(), deleteTenant);

module.exports = router;

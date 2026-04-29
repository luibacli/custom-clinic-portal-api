const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const uploadCloudinary = require('../middleware/uploadCloudinary');
const {
  createUserTenant,
  fetchAllUsers,
  fetchUsersByTenant,
  tenantLogin,
  fetchUser,
  updateUserTenant,
  uploadUserPhoto,
  deleteUserTenant,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  toggleUserStatus,
  fetchTenantActivityLogs,
  exportPatientData,
  anonymizePatientData,
} = require('../controllers/authTenantController');

router.post('/login',               tenantLogin);
router.post('/create',              auth(['dev', 'admin', 'superadmin']), createUserTenant);
router.post('/forgot-password',     forgotPassword);
router.post('/reset-password',      resetPassword);
router.post('/resend-verification', resendVerification);
router.get('/verify-email',         verifyEmail);
router.get('/me',                   auth(),                               fetchUser);
router.get('/users/all',            auth(['dev']),                        fetchAllUsers);
router.get('/:id/users',            auth(['dev', 'admin', 'superadmin']), fetchUsersByTenant);
router.get('/:id/activity-logs',    auth(['dev', 'superadmin']),          fetchTenantActivityLogs);
router.put('/:id/user/update',      auth(['dev', 'admin', 'superadmin']), updateUserTenant);
router.patch('/change-password',    auth(),                               changePassword);
router.patch('/:id/photo',          auth(),                               uploadCloudinary.single('image'), uploadUserPhoto);
router.patch('/:id/toggle-status',  auth(['dev', 'admin', 'superadmin']), toggleUserStatus);
router.delete('/:id/delete',        auth(['dev', 'superadmin']),          deleteUserTenant);

// PDPA compliance
router.get('/:id/export',           auth(), exportPatientData);
router.delete('/:id/data',          auth(), anonymizePatientData);

module.exports = router;

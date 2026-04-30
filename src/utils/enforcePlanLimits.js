const UserTenant = require('../models/UserTenant');
const Tenant     = require('../models/Tenant');
const PLANS      = require('../config/plans');

const STAFF_ROLES = ['admin', 'superadmin'];

/**
 * Check if a tenant can add another patient.
 * Returns { allowed: true } or { allowed: false, message: '...' }
 */
const canAddPatient = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId).select('subscription').lean();
  if (!tenant) return { allowed: false, message: 'Tenant not found' };

  const plan  = tenant.subscription?.plan || 'starter';
  const limit = PLANS[plan]?.patientLimit ?? 500;

  if (limit === null) return { allowed: true }; // unlimited (premium)

  const count = await UserTenant.countDocuments({ tenantId, role: 'patient' });
  if (count >= limit) {
    return {
      allowed: false,
      message: `Patient limit reached (${limit}). Upgrade your plan to add more patients.`,
    };
  }

  return { allowed: true };
};

/**
 * Check if a tenant can add another staff user (admin/superadmin).
 */
const canAddStaff = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId).select('subscription').lean();
  if (!tenant) return { allowed: false, message: 'Tenant not found' };

  const plan  = tenant.subscription?.plan || 'starter';
  const limit = PLANS[plan]?.userLimit ?? 2;

  if (limit === null) return { allowed: true }; // unlimited (premium)

  const count = await UserTenant.countDocuments({ tenantId, role: { $in: STAFF_ROLES } });
  if (count >= limit) {
    return {
      allowed: false,
      message: `Staff account limit reached (${limit}). Upgrade your plan to add more accounts.`,
    };
  }

  return { allowed: true };
};

module.exports = { canAddPatient, canAddStaff };

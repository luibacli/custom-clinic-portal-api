const Tenant = require('../models/Tenant');

/**
 * Blocks access when a tenant's trial has expired or subscription is cancelled/suspended.
 * Attach after auth() on routes that should be gated by subscription.
 * Backwards-compatible: tenants without subscription data are treated as active.
 */
const requireSubscription = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return next(); // dev role or no tenant context — skip

    const tenant = await Tenant.findById(tenantId).select('subscription').lean();
    if (!tenant) return next(); // tenant not found — let route handle 404

    const sub = tenant.subscription;

    // No subscription data yet (legacy tenant) — treat as active
    if (!sub) return next();

    const { status, trialEndsAt } = sub;

    if (status === 'trial' && trialEndsAt && new Date() > new Date(trialEndsAt)) {
      return res.status(402).json({
        success: false,
        code: 'TRIAL_EXPIRED',
        message: 'Your 30-day free trial has ended. Please subscribe to continue.',
      });
    }

    if (status === 'suspended') {
      return res.status(402).json({
        success: false,
        code: 'SUBSCRIPTION_SUSPENDED',
        message: 'Your subscription is suspended due to a failed payment. Please update your billing.',
      });
    }

    if (status === 'cancelled') {
      return res.status(402).json({
        success: false,
        code: 'SUBSCRIPTION_CANCELLED',
        message: 'Your subscription has been cancelled.',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = requireSubscription;

const crypto = require('crypto');
const Tenant = require('../models/Tenant');
const PLANS  = require('../config/plans');

const PAYMONGO_BASE = 'https://api.paymongo.com/v1';

const paymongoHeaders = () => ({
  'Content-Type':  'application/json',
  'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
});

/**
 * Create a PayMongo payment link for a subscription plan.
 * POST /api/billing/checkout
 * Body: { plan: 'starter'|'growth'|'premium', billing: 'monthly'|'annual' }
 */
const createCheckout = async (req, res) => {
  try {
    const { plan = 'starter', billing = 'monthly' } = req.body;

    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No tenant context' });

    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const planConfig = PLANS[plan];
    if (!planConfig) return res.status(400).json({ success: false, message: 'Invalid plan' });

    const amount      = billing === 'annual' ? planConfig.price.annual : planConfig.price.monthly;
    const description = `My Clinic Access — ${planConfig.name} (${billing === 'annual' ? 'Annual' : 'Monthly'})`;
    const reference   = `MCA-${tenantId}-${Date.now()}`;

    const response = await fetch(`${PAYMONGO_BASE}/links`, {
      method:  'POST',
      headers: paymongoHeaders(),
      body: JSON.stringify({
        data: {
          attributes: {
            amount,
            description,
            reference_number: reference,
            remarks: `tenantId:${tenantId}|plan:${plan}|billing:${billing}`,
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(502).json({ success: false, message: 'Payment gateway error', detail: err });
    }

    const result = await response.json();
    const checkoutUrl = result.data?.attributes?.checkout_url;

    return res.status(201).json({
      success: true,
      checkoutUrl,
      reference,
      plan,
      billing,
      amount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PayMongo webhook — receives payment events.
 * POST /api/billing/webhook
 * Verifies signature, activates subscription on payment.paid.
 */
const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['paymongo-signature'];
    if (!signature) return res.status(400).json({ ok: false, error: 'Missing signature' });

    // Verify HMAC signature
    const secret  = process.env.PAYMONGO_WEBHOOK_SECRET;
    const payload  = JSON.stringify(req.body);
    const [tPart, v1Part] = signature.split(',').reduce((acc, part) => {
      const [key, val] = part.split('=');
      if (key === 't')  acc[0] = val;
      if (key === 'v1') acc[1] = val;
      return acc;
    }, [null, null]);

    if (!tPart || !v1Part) return res.status(400).json({ ok: false, error: 'Invalid signature format' });

    const computed = crypto
      .createHmac('sha256', secret)
      .update(`${tPart}.${payload}`)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(v1Part))) {
      return res.status(401).json({ ok: false, error: 'Signature mismatch' });
    }

    const event = req.body?.data;
    const type  = event?.attributes?.type;

    if (type === 'payment.paid') {
      const remarks = event?.attributes?.data?.attributes?.remarks || '';

      // Parse tenantId, plan, billing from remarks
      const tenantIdMatch = remarks.match(/tenantId:([^|]+)/);
      const planMatch     = remarks.match(/plan:([^|]+)/);
      const billingMatch  = remarks.match(/billing:([^|]+)/);

      const tenantId = tenantIdMatch?.[1];
      const plan     = planMatch?.[1] || 'starter';
      const billing  = billingMatch?.[1] || 'monthly';

      if (!tenantId) return res.status(400).json({ ok: false, error: 'No tenantId in remarks' });

      const daysToAdd = billing === 'annual' ? 365 : 30;
      const currentPeriodEnd = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
      const planConfig = PLANS[plan];

      await Tenant.findByIdAndUpdate(tenantId, {
        $set: {
          'subscription.plan':              plan,
          'subscription.status':            'active',
          'subscription.currentPeriodEnd':  currentPeriodEnd,
          'subscription.paymongoPaymentId': event?.id || '',
          ...(planConfig ? { features: planConfig.features } : {}),
        },
      });

      return res.json({ ok: true, activated: tenantId, plan });
    }

    if (type === 'payment.failed') {
      const remarks  = event?.attributes?.data?.attributes?.remarks || '';
      const tenantId = remarks.match(/tenantId:([^|]+)/)?.[1];
      if (tenantId) {
        await Tenant.findByIdAndUpdate(tenantId, {
          $set: { 'subscription.status': 'past_due' },
        });
      }
      return res.json({ ok: true });
    }

    // Unhandled event — acknowledge to prevent PayMongo retries
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * Get current tenant's subscription status.
 * GET /api/billing/status
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No tenant context' });

    const tenant = await Tenant.findById(tenantId)
      .select('subscription name domain')
      .lean();

    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const sub   = tenant.subscription || {};
    const plan  = sub.plan || 'starter';
    const limits = {
      patientLimit: PLANS[plan]?.patientLimit ?? 500,
      userLimit:    PLANS[plan]?.userLimit    ?? 2,
    };

    return res.json({
      success: true,
      data: {
        plan:             plan,
        status:           sub.status || 'trial',
        trialEndsAt:      sub.trialEndsAt || null,
        currentPeriodEnd: sub.currentPeriodEnd || null,
        limits,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Dev-only: manually set a tenant's plan (for internal provisioning).
 * PATCH /api/billing/set-plan
 */
const setPlan = async (req, res) => {
  try {
    const { tenantId, plan, status = 'active' } = req.body;
    if (!tenantId || !plan) {
      return res.status(400).json({ success: false, message: 'tenantId and plan are required' });
    }
    if (!PLANS[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const updated = await Tenant.findByIdAndUpdate(
      tenantId,
      {
        $set: {
          'subscription.plan':             plan,
          'subscription.status':           status,
          'subscription.currentPeriodEnd': currentPeriodEnd,
          features: PLANS[plan].features,
        },
      },
      { new: true }
    ).select('name domain subscription features');

    if (!updated) return res.status(404).json({ success: false, message: 'Tenant not found' });

    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createCheckout, handleWebhook, getSubscriptionStatus, setPlan };

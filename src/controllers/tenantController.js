const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cloudinary = require('../config/cloudinary');
const Tenant = require('../models/Tenant');
const UserTenant = require('../models/UserTenant');
const Service = require('../models/Service');
const sendEmail = require('../utils/sendEmail');
const uploadToCloudinary = require('../utils/uploadToCloudinary');
const PLANS = require('../config/plans');

const DEFAULT_SERVICES = [
  'General Consultation', 'Follow-up Checkup', 'Laboratory Request',
  'Prescription Renewal', 'Vaccination', 'Medical Certificate', 'Others',
];

const ALLOWED_PLANS        = ['starter', 'growth', 'premium'];
const ALLOWED_SUB_STATUSES = ['trial', 'active', 'past_due', 'suspended', 'cancelled'];

/**
 * Public self-service clinic signup.
 * Creates tenant + superadmin + seeds services in one atomic flow.
 */
const registerClinic = async (req, res) => {
  const { clinicName, domain, ownerEmail, ownerFirstName, ownerLastName, ownerPassword } = req.body;

  if (!clinicName || !domain || !ownerEmail || !ownerFirstName || !ownerLastName || !ownerPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return res.status(400).json({ success: false, message: 'Invalid email address' });
  }

  if (ownerPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }

  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();

  try {
    const [existingTenant, existingUser] = await Promise.all([
      Tenant.findOne({ domain: normalizedDomain }),
      UserTenant.findOne({ email: ownerEmail.toLowerCase().trim() }),
    ]);

    if (existingTenant) {
      return res.status(409).json({ success: false, message: 'This domain is already registered' });
    }
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    // Create tenant on starter trial
    const tenant = await Tenant.create({
      name:   clinicName.trim(),
      domain: normalizedDomain,
      status: 'active',
      features: PLANS.starter.features,
      subscription: {
        plan:        'starter',
        status:      'trial',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Create superadmin owner
    const hashedPassword = await bcrypt.hash(ownerPassword, 10);
    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    const hashedVerifyToken = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');

    const owner = await UserTenant.create({
      tenantId:                tenant._id,
      email:                   ownerEmail.toLowerCase().trim(),
      firstName:               ownerFirstName.trim(),
      lastName:                ownerLastName.trim(),
      password:                hashedPassword,
      role:                    'superadmin',
      verificationToken:       hashedVerifyToken,
      verificationTokenExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    // Seed default services (non-blocking)
    const serviceDocs = DEFAULT_SERVICES.map((name, i) => ({
      tenantId: String(tenant._id), name, description: '', isActive: true, order: i,
    }));
    Service.insertMany(serviceDocs).catch(() => {});

    // Send welcome email (non-blocking)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-email?token=${rawVerifyToken}`;
    sendEmail({
      to: ownerEmail,
      subject: `Welcome to My Clinic Access — ${clinicName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="margin:0 0 8px;color:#1e293b;">Welcome, ${ownerFirstName}!</h2>
          <p style="color:#64748b;margin:0 0 8px;">Your clinic <strong>${clinicName}</strong> is now registered on My Clinic Access.</p>
          <p style="color:#64748b;margin:0 0 24px;">Your 30-day free trial has started. Please verify your email to activate your account.</p>
          <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Verify Email & Get Started</a>
          <p style="color:#94a3b8;font-size:13px;margin-top:24px;">This link expires in 48 hours.</p>
        </div>
      `,
    }).catch(() => {});

    // Issue JWT so clinic can log in immediately
    const token = jwt.sign(
      { id: owner._id, role: owner.role, tenantId: tenant._id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(201).json({
      success: true,
      message: 'Clinic registered successfully. Your 30-day trial has started.',
      token,
      tenant: {
        id:     tenant._id,
        name:   tenant.name,
        domain: tenant.domain,
        subscription: tenant.subscription,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const normalizeHost = (host = '') =>
  host.toLowerCase().replace(/^www\./, '').split(':')[0];

const resolveTenantByHost = async (req, res) => {
  try {
    const host = normalizeHost(req.query.host || req.headers.host);
    if (!host) return res.status(400).json({ message: 'Host is required' });

    const tenant = await Tenant.findOne({ domain: host, status: 'active' }).lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    res.status(200).json({
      id:         tenant._id,
      name:       tenant.name,
      domain:     tenant.domain,
      status:     tenant.status,
      tenantLogo: tenant.tenantLogo,
      features:   tenant.features,
      branding:   tenant.branding,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const fetchAllTenants = async (_req, res) => {
  try {
    const tenants = await Tenant.find().lean();
    res.status(200).json(tenants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const fetchTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant Not Found' });
    res.status(200).json({ success: true, data: tenant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createTenant = async (req, res) => {
  try {
    const { name, domain, status, plan, subscriptionStatus } = req.body;
    if (!name || !domain) {
      return res.status(400).json({ success: false, message: 'Name and domain are required.' });
    }
    const existing = await Tenant.findOne({ domain: domain.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'This domain is already registered.' });
    }
    const doc = {
      name,
      domain: domain.toLowerCase().trim(),
      status: status || 'active',
      subscription: {
        plan:   ALLOWED_PLANS.includes(plan) ? plan : 'starter',
        status: ALLOWED_SUB_STATUSES.includes(subscriptionStatus) ? subscriptionStatus : 'trial',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    };
    const tenant = await Tenant.create(doc);
    res.status(201).json({ success: true, data: tenant, message: 'Tenant Created Successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateTenant = async (req, res) => {
  try {
    const { name, domain, status, tenantLogo } = req.body;
    const updated = await Tenant.findByIdAndUpdate(
      req.params.id,
      {
        name, domain, status,
        tenantLogo: {
          url:      tenantLogo?.url      || '',
          publicId: tenantLogo?.publicId || '',
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Not Found' });
    res.status(200).json({ success: true, data: updated, message: 'Tenant Updated Successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Clinic not found' });

    if (tenant.tenantLogo?.publicId) {
      await cloudinary.uploader.destroy(tenant.tenantLogo.publicId);
    }

    const result = await uploadToCloudinary(req.file.buffer, 'clinic-portal/logo');
    tenant.tenantLogo = { url: result.secure_url, publicId: result.public_id };
    await tenant.save();

    return res.status(200).json({ message: 'Logo uploaded successfully', tenantLogo: tenant.tenantLogo });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndDelete(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    res.status(200).json({ success: true, message: 'Tenant deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const ALLOWED_BRANDING = ['primaryColor', 'address', 'phone', 'email', 'welcomeMessage'];

const updateTenantBranding = async (req, res) => {
  try {
    const { branding } = req.body;
    if (!branding || typeof branding !== 'object') {
      return res.status(400).json({ message: 'branding object is required' });
    }

    const update = {};
    for (const key of ALLOWED_BRANDING) {
      if (branding[key] !== undefined) update[`branding.${key}`] = branding[key];
    }

    const updated = await Tenant.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Tenant not found' });

    res.status(200).json({ success: true, data: updated.branding, message: 'Branding updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const ALLOWED_FEATURES = ['messaging', 'appointments', 'qrScan', 'mails', 'users', 'analytics', 'exportReports', 'smsReminders'];

const updateTenantFeatures = async (req, res) => {
  try {
    const { features } = req.body;
    if (!features || typeof features !== 'object') {
      return res.status(400).json({ message: 'features object is required' });
    }

    const update = {};
    for (const key of ALLOWED_FEATURES) {
      if (typeof features[key] === 'boolean') update[`features.${key}`] = features[key];
    }

    const updated = await Tenant.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Tenant not found' });

    res.status(200).json({ success: true, data: updated.features, message: 'Features updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateSubscription = async (req, res) => {
  try {
    const { plan, status, trialEndsAt, currentPeriodEnd } = req.body;

    if (plan && !ALLOWED_PLANS.includes(plan)) {
      return res.status(400).json({ message: `Invalid plan. Must be one of: ${ALLOWED_PLANS.join(', ')}` });
    }
    if (status && !ALLOWED_SUB_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${ALLOWED_SUB_STATUSES.join(', ')}` });
    }

    const update = {};
    if (plan)             update['subscription.plan']             = plan;
    if (status)           update['subscription.status']           = status;
    if (trialEndsAt)      update['subscription.trialEndsAt']      = new Date(trialEndsAt);
    if (currentPeriodEnd) update['subscription.currentPeriodEnd'] = new Date(currentPeriodEnd);

    const updated = await Tenant.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Tenant not found' });

    res.status(200).json({ success: true, data: updated.subscription, message: 'Subscription updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
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
};

const cloudinary = require('../config/cloudinary');
const Tenant = require('../models/Tenant');
const uploadToCloudinary = require('../utils/uploadToCloudinary');

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
    const { name, domain, status } = req.body;
    const tenant = await Tenant.create({ name, domain, status });
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

module.exports = {
  resolveTenantByHost,
  fetchAllTenants,
  fetchTenant,
  createTenant,
  updateTenant,
  uploadLogo,
  deleteTenant,
  updateTenantBranding,
  updateTenantFeatures,
};

const Service = require('../models/Service');
const UserTenant = require('../models/UserTenant');

const ADMIN_ROLES = ['admin', 'superadmin', 'dev'];

const DEFAULT_SERVICES = [
  'General Consultation',
  'Follow-up Checkup',
  'Laboratory Request',
  'Prescription Renewal',
  'Vaccination',
  'Medical Certificate',
  'Others',
];

const getServices = async (req, res) => {
  try {
    const services = await Service.find({ tenantId: req.params.tenantId })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createService = async (req, res) => {
  try {
    const actor = await UserTenant.findById(req.user.id).lean();
    if (!ADMIN_ROLES.includes(actor?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { tenantId } = req.params;
    const { name, description, isActive, order } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Service name is required' });

    const last = await Service.findOne({ tenantId }).sort({ order: -1 }).lean();
    const nextOrder = (last?.order ?? -1) + 1;

    const service = await Service.create({
      tenantId,
      name:        name.trim(),
      description: description?.trim() || '',
      isActive:    isActive !== undefined ? isActive : true,
      order:       order !== undefined ? order : nextOrder,
    });

    res.status(201).json({ success: true, data: service, message: 'Service created' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateService = async (req, res) => {
  try {
    const actor = await UserTenant.findById(req.user.id).lean();
    if (!ADMIN_ROLES.includes(actor?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { name, description, isActive, order } = req.body;
    const update = {};
    if (name        !== undefined) update.name        = name.trim();
    if (description !== undefined) update.description = description.trim();
    if (isActive    !== undefined) update.isActive    = isActive;
    if (order       !== undefined) update.order       = order;

    const service = await Service.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    res.json({ success: true, data: service, message: 'Service updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteService = async (req, res) => {
  try {
    const actor = await UserTenant.findById(req.user.id).lean();
    if (!ADMIN_ROLES.includes(actor?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    res.json({ success: true, message: 'Service deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const seedDefaultServices = async (req, res) => {
  try {
    const actor = await UserTenant.findById(req.user.id).lean();
    if (!ADMIN_ROLES.includes(actor?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { tenantId } = req.params;
    const existing = await Service.countDocuments({ tenantId });
    if (existing > 0) {
      return res.status(409).json({ success: false, message: 'Services already exist for this tenant' });
    }

    const docs = DEFAULT_SERVICES.map((name, i) => ({ tenantId, name, description: '', isActive: true, order: i }));
    const created = await Service.insertMany(docs);

    res.status(201).json({ success: true, data: created, message: 'Default services seeded' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getServices, createService, updateService, deleteService, seedDefaultServices };

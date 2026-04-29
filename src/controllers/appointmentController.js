const Appointment = require('../models/Appointment');
const UserTenant = require('../models/UserTenant');

const createAppointment = async (req, res) => {
  try {
    const user = await UserTenant.findById(req.user.id).lean();
    if (!user || user.role !== 'patient') {
      return res.status(403).json({ success: false, message: 'Only patients can book appointments' });
    }

    const { serviceType, appointmentDate, notes } = req.body;
    if (!serviceType || !appointmentDate) {
      return res.status(400).json({ success: false, message: 'serviceType and appointmentDate are required' });
    }

    const appointment = await Appointment.create({
      tenantId:        user.tenantId,
      patientId:       user._id,
      patientName:     [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || user.email,
      patientEmail:    user.email,
      serviceType,
      appointmentDate: new Date(appointmentDate),
      notes:           notes || '',
    });

    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const fetchMyAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ patientId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ success: true, data: appointments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const fetchAllAppointments = async (req, res) => {
  try {
    const admin = await UserTenant.findById(req.user.id).lean();
    if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { tenantId } = req.params;
    const { status, date, page = 1, limit = 100 } = req.query;

    const filter = { tenantId };
    if (status && status !== 'all') filter.status = status;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.appointmentDate = { $gte: start, $lte: end };
    }

    const cappedLimit = Math.min(Number(limit), 500);
    const skip = (Number(page) - 1) * cappedLimit;

    const [appointments, total] = await Promise.all([
      Appointment.find(filter).sort({ appointmentDate: 1, createdAt: 1 }).skip(skip).limit(cappedLimit).lean(),
      Appointment.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: appointments,
      total,
      page: Number(page),
      pages: Math.ceil(total / cappedLimit),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const fetchQueueStatus = async (req, res) => {
  try {
    const user = await UserTenant.findById(req.user.id).select('tenantId role').lean();
    if (!user || user.tenantId?.toString() !== req.params.tenantId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { tenantId } = req.params;

    const [ongoing, inQueueCount] = await Promise.all([
      Appointment.findOne({ tenantId, status: 'ongoing' }).select('queueNumber').lean(),
      Appointment.countDocuments({ tenantId, status: 'in-queue' }),
    ]);

    res.json({
      success: true,
      data: {
        nowServing:   ongoing?.queueNumber ?? null,
        inQueueCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const manageAppointment = async (req, res) => {
  try {
    const admin = await UserTenant.findById(req.user.id).lean();
    if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { status, queueNumber, adminNotes, cancelReason } = req.body;
    const update = {};
    if (status      !== undefined)              update.status      = status;
    if (queueNumber !== undefined && queueNumber !== null) update.queueNumber = Number(queueNumber);
    if (adminNotes  !== undefined)              update.adminNotes  = adminNotes;
    if (cancelReason !== undefined)             update.cancelReason = cancelReason;

    const existing = await Appointment.findById(req.params.id).select('status patientId').lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const appointment = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

    // Emit socket event when transitioning to 'ongoing'
    if (update.status === 'ongoing' && existing.status !== 'ongoing' && appointment.patientId) {
      const io = req.app.get('socketio');
      if (io) io.to(`patient:${appointment.patientId}`).emit('appointment:ongoing', { queueNumber: appointment.queueNumber });
    }

    res.json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const cancelAppointment = async (req, res) => {
  try {
    const user = await UserTenant.findById(req.user.id).lean();
    if (!user) return res.status(403).json({ success: false, message: 'Forbidden' });

    const { cancelReason } = req.body;
    const filter = { _id: req.params.id };
    if (user.role === 'patient') filter.patientId = user._id;

    const appointment = await Appointment.findOneAndUpdate(
      filter,
      { status: 'cancelled', cancelReason: cancelReason || '' },
      { new: true }
    ).lean();

    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
    res.json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createAppointment,
  fetchMyAppointments,
  fetchAllAppointments,
  fetchQueueStatus,
  manageAppointment,
  cancelAppointment,
};

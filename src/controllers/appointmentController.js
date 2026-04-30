const Appointment = require('../models/Appointment');
const UserTenant = require('../models/UserTenant');
const Tenant = require('../models/Tenant');
const sendEmail = require('../utils/sendEmail');

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173';

const apptEmailHtml = ({ heading, subheading, body, patientName, clinicName }) => `
  <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;">
    <h2 style="margin:0 0 4px;color:#1e293b;">${heading}</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#64748b;">${subheading}</p>
    <div style="background:#f8fafc;border-radius:12px;padding:16px 20px;margin-bottom:20px;">${body}</div>
    <p style="font-size:12px;color:#94a3b8;margin:0;">This message was sent by <strong>${clinicName}</strong> via My Clinic Access.</p>
  </div>
`;

const sendApptNotification = (patient, appointment, clinicName, statusType) => {
  if (!patient?.email || patient.email.includes('@anonymized.invalid')) return;

  const date = new Date(appointment.appointmentDate).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const name = patient.firstName || 'Patient';

  const templates = {
    confirmed: {
      subject: `Appointment Confirmed — ${clinicName}`,
      heading: 'Your appointment is confirmed!',
      subheading: `Hi ${name}, great news — your appointment has been approved.`,
      body: `<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Service:</strong> ${appointment.serviceType}</p>
             <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Date:</strong> ${date}</p>
             <p style="margin:0;font-size:13px;color:#64748b;">Please arrive on time. You'll be given a queue number when you arrive at the clinic.</p>`,
    },
    'in-queue': {
      subject: `You're in the queue — ${clinicName}`,
      heading: `You're in Queue #${appointment.queueNumber ?? '—'}!`,
      subheading: `Hi ${name}, you have been checked in and assigned a queue number.`,
      body: `<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Queue Number:</strong> #${appointment.queueNumber ?? '—'}</p>
             <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Service:</strong> ${appointment.serviceType}</p>
             <p style="margin:0;font-size:13px;color:#64748b;">Please wait for your name to be called. You can track your queue position in the patient portal.</p>`,
    },
    completed: {
      subject: `Visit complete — thank you, ${clinicName}`,
      heading: 'Your visit is complete',
      subheading: `Hi ${name}, your appointment has been marked as completed.`,
      body: `<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Service:</strong> ${appointment.serviceType}</p>
             <p style="margin:0;font-size:13px;color:#64748b;">Thank you for visiting ${clinicName}. Book your next appointment anytime through the patient portal.</p>`,
    },
    cancelled: {
      subject: `Appointment cancelled — ${clinicName}`,
      heading: 'Your appointment has been cancelled',
      subheading: `Hi ${name}, your appointment has been cancelled.`,
      body: `<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Service:</strong> ${appointment.serviceType}</p>
             <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Date:</strong> ${date}</p>
             ${appointment.cancelReason ? `<p style="margin:0;font-size:13px;color:#64748b;"><strong>Reason:</strong> ${appointment.cancelReason}</p>` : ''}`,
    },
  };

  const t = templates[statusType];
  if (!t) return;

  sendEmail({
    to: patient.email,
    subject: t.subject,
    html: apptEmailHtml({ ...t, patientName: name, clinicName }),
  }).catch(() => {});
};

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

    // Email notification on key status transitions
    const notifyStatuses = ['confirmed', 'in-queue', 'completed'];
    if (update.status && notifyStatuses.includes(update.status) && update.status !== existing.status) {
      const [patient, tenant] = await Promise.all([
        UserTenant.findById(appointment.patientId).select('email firstName').lean(),
        Tenant.findById(appointment.tenantId).select('name').lean(),
      ]);
      sendApptNotification(patient, appointment, tenant?.name || 'Your Clinic', update.status);
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

    // Email notification on cancellation
    const [patient, tenant] = await Promise.all([
      UserTenant.findById(appointment.patientId).select('email firstName').lean(),
      Tenant.findById(appointment.tenantId).select('name').lean(),
    ]);
    sendApptNotification(patient, { ...appointment, cancelReason: cancelReason || '' }, tenant?.name || 'Your Clinic', 'cancelled');

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

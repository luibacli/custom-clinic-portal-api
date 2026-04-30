const Appointment = require('../models/Appointment');
const UserTenant = require('../models/UserTenant');

/**
 * GET /api/v1/analytics/:tenantId
 * Returns appointment trends, status breakdown, top services, and patient growth.
 * Accessible by admin and superadmin of the same tenant.
 */
const getTenantAnalytics = async (req, res) => {
  try {
    const admin = await UserTenant.findById(req.user.id).select('tenantId role').lean();
    if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { tenantId } = req.params;

    if (admin.tenantId?.toString() !== tenantId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      byDayRaw,
      byStatus,
      topServices,
      thisMonthCount,
      lastMonthCount,
      patientGrowthRaw,
    ] = await Promise.all([
      // Appointments per day — last 30 days
      Appointment.aggregate([
        { $match: { tenantId, appointmentDate: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$appointmentDate' } },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),

      // By status breakdown
      Appointment.aggregate([
        { $match: { tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Top 5 services
      Appointment.aggregate([
        { $match: { tenantId, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$serviceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      // This month count
      Appointment.countDocuments({
        tenantId,
        appointmentDate: { $gte: startOfThisMonth },
      }),

      // Last month count
      Appointment.countDocuments({
        tenantId,
        appointmentDate: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),

      // Patient registrations per week — last 8 weeks
      UserTenant.aggregate([
        {
          $match: {
            tenantId: require('mongoose').Types.ObjectId.createFromHexString
              ? undefined // handled below
              : undefined,
            role: 'patient',
            createdAt: { $gte: new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000) },
          },
        },
        { $group: {
          _id: { $dateToString: { format: '%Y-%W', date: '$createdAt' } },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Build patient growth with tenantId filter (ObjectId)
    const mongoose = require('mongoose');
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
    const patientGrowth = await UserTenant.aggregate([
      {
        $match: {
          tenantId: mongoose.Types.ObjectId.isValid(tenantId)
            ? new mongoose.Types.ObjectId(tenantId)
            : tenantId,
          role: 'patient',
          createdAt: { $gte: eightWeeksAgo },
        },
      },
      { $group: {
        _id: { $dateToString: { format: '%Y-%W', date: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    // Fill in missing days for the last 30 days
    const dayMap = {};
    byDayRaw.forEach(d => { dayMap[d._id] = d.count; });
    const appointmentsByDay = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      appointmentsByDay.push({ date: key, count: dayMap[key] || 0 });
    }

    return res.json({
      success: true,
      data: {
        appointmentsByDay,
        byStatus: byStatus.map(s => ({ status: s._id, count: s.count })),
        topServices: topServices.map(s => ({ service: s._id, count: s.count })),
        summary: {
          thisMonth: thisMonthCount,
          lastMonth: lastMonthCount,
          trend: lastMonthCount > 0
            ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
            : null,
        },
        patientGrowth: patientGrowth.map(w => ({ week: w._id, count: w.count })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getTenantAnalytics };

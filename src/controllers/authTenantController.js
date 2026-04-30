const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cloudinary = require('../config/cloudinary');
const UserTenant = require('../models/UserTenant');
const Tenant = require('../models/Tenant');
const Appointment = require('../models/Appointment');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const TenantActivityLogs = require('../models/TenantActivityLogs');
const uploadToCloudinary = require('../utils/uploadToCloudinary');
const sendEmail = require('../utils/sendEmail');
const { canAddPatient, canAddStaff } = require('../utils/enforcePlanLimits');

const createUserTenant = async (req, res) => {
  try {
    const { pin, email, firstName, middleName, lastName, birthday, phone, password, role } = req.body;
    // Non-dev callers are always scoped to their own tenant
    const tenantId = req.user.role === 'dev' ? req.body.tenantId : req.user.tenantId;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant Not Found' });

    const existingUser = await UserTenant.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email Already Exists' });

    if (!password) return res.status(400).json({ message: 'Password is required' });

    // Enforce plan limits
    if (role === 'patient') {
      const check = await canAddPatient(tenantId);
      if (!check.allowed) return res.status(403).json({ success: false, message: check.message });
    } else if (['admin', 'superadmin'].includes(role)) {
      const check = await canAddStaff(tenantId);
      if (!check.allowed) return res.status(403).json({ success: false, message: check.message });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    const hashedVerifyToken = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');

    const user = await UserTenant.create({
      tenantId, pin, email, firstName, middleName, lastName, birthday, phone,
      password: hashedPassword,
      role,
      verificationToken: hashedVerifyToken,
      verificationTokenExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-email?token=${rawVerifyToken}`;

    sendEmail({
      to: email,
      subject: 'Verify Your Account',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="margin:0 0 8px;color:#1e293b;">Welcome to the Portal</h2>
          <p style="color:#64748b;margin:0 0 24px;">Hi ${firstName || 'there'},<br>Please verify your email address to activate your account.</p>
          <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Verify Email</a>
          <p style="color:#94a3b8;font-size:13px;margin-top:24px;">This link expires in 48 hours.</p>
        </div>
      `,
    }).catch(() => {});

    const safeUser = user.toObject();
    delete safeUser.password;

    res.status(201).json({ success: true, data: safeUser, message: 'User Created Successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create user', error: error.message });
  }
};

const fetchAllUsers = async (req, res) => {
  try {
    const { search, role, tenantId } = req.query;
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 200);
    const skip  = (page - 1) * limit;

    const query = {};
    if (tenantId) query.tenantId = tenantId;
    if (role)     query.role = role;
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
    }

    const [total, users] = await Promise.all([
      UserTenant.countDocuments(query),
      UserTenant.find(query)
        .select('-password -resetToken -resetTokenExpiry -verificationToken -verificationTokenExpiry')
        .populate('tenantId', 'name domain')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({ success: true, data: users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
};

const fetchUsersByTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;

    if (req.user.role !== 'dev' && req.user.tenantId?.toString() !== tenantId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { search } = req.query;

    const query = { tenantId };
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { firstName: regex }, { lastName: regex },
        { email: regex },     { role: regex },
        { pin: regex },
      ];
    }

    let users = await UserTenant.find(query).select('-password').lean();

    // REF ID suffix search
    if (search && /^[0-9a-fA-F]{4,8}$/.test(search.trim())) {
      const suffix = search.trim().toLowerCase();
      const existingIds = new Set(users.map(u => u._id.toString()));
      const all = await UserTenant.find({ tenantId }).select('-password').lean();
      const refMatches = all.filter(u =>
        u._id.toString().toLowerCase().endsWith(suffix) &&
        !existingIds.has(u._id.toString())
      );
      if (refMatches.length) users = [...users, ...refMatches];
    }

    res.status(200).json({ success: true, data: users, count: users.length });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users by tenant', error: error.message });
  }
};

const tenantLogin = async (req, res) => {
  const { email, password } = req.body;

  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    typeof password !== 'string'
  ) {
    return res.status(400).json({ message: 'Invalid email or password' });
  }

  try {
    const user = await UserTenant.findOne({ email }).lean();
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    if (!user.isActive) {
      return res.status(403).json({
        message: 'Your account has been deactivated. Please contact your clinic.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: 'Your account is not yet verified. Please verify your email or ask clinic staff to verify your account.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, tenantId: user.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await TenantActivityLogs.create({
      tenantId:     user.tenantId,
      userTenantId: user._id,
      role:         user.role,
      ipAddress:    req.ip,
      action:       'LOGIN',
      status:       'SUCCESS',
    });

    return res.status(200).json({ message: 'Login Successful', token });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const fetchUser = async (req, res) => {
  try {
    const user = await UserTenant.findById(req.user.id).select('-password').lean();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

const updateUserTenant = async (req, res) => {
  try {
    const { pin, email, firstName, middleName, lastName, birthday, phone, password, role } = req.body;

    const target = await UserTenant.findById(req.params.id).select('tenantId role').lean();
    if (!target) return res.status(404).json({ message: 'User not found' });

    if (req.user.role !== 'dev' && target.tenantId?.toString() !== req.user.tenantId?.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Prevent privilege escalation — enforce role transition rules
    let safeRole = target.role;
    if (role !== undefined) {
      const caller = req.user.role;
      if (caller === 'dev') {
        safeRole = role;
      } else if (caller === 'superadmin' && ['patient', 'admin', 'superadmin'].includes(role)) {
        safeRole = role;
      } else if (caller === 'admin' && role === 'patient') {
        safeRole = role;
      }
    }

    const update = { pin, email, firstName, middleName, lastName, birthday, phone, role: safeRole };
    if (password) update.password = await bcrypt.hash(password, 10);

    const updated = await UserTenant.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select('-password');
    if (!updated) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ success: true, user: updated, message: 'User Updated Successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const uploadUserPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });

    const user = await UserTenant.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.profilePhoto?.publicId) {
      await cloudinary.uploader.destroy(user.profilePhoto.publicId);
    }

    const result = await uploadToCloudinary(req.file.buffer, 'clinic-portal/users');
    user.profilePhoto = { url: result.secure_url, publicId: result.public_id };
    await user.save();

    return res.status(200).json({ message: 'Photo uploaded successfully', profilePhoto: user.profilePhoto });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteUserTenant = async (req, res) => {
  try {
    const deleted = await UserTenant.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'User Not Found' });
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await UserTenant.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await UserTenant.findOne({ email });
    // Always return same message to prevent enumeration
    if (!user) return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="margin:0 0 8px;color:#1e293b;">Reset Your Password</h2>
          <p style="color:#64748b;margin:0 0 24px;">Hi ${user.firstName || 'there'},<br>We received a request to reset your password.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Reset Password</a>
          <p style="color:#94a3b8;font-size:13px;margin-top:24px;">This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await UserTenant.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'Token is required' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await UserTenant.findOne({
      verificationToken: hashedToken,
      verificationTokenExpiry: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired verification link' });

    user.isEmailVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpiry = null;
    await user.save();

    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await UserTenant.findOne({ email });
    if (!user) return res.status(200).json({ message: 'If that email exists, a verification link has been sent.' });
    if (user.isEmailVerified) return res.status(400).json({ message: 'Email is already verified' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.verificationTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-email?token=${rawToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Verify Your Account',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="margin:0 0 8px;color:#1e293b;">Verify Your Email</h2>
          <p style="color:#64748b;margin:0 0 24px;">Hi ${user.firstName || 'there'},<br>Here's your new verification link.</p>
          <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Verify Email</a>
          <p style="color:#94a3b8;font-size:13px;margin-top:24px;">This link expires in 48 hours.</p>
        </div>
      `,
    });

    return res.status(200).json({ message: 'Verification link sent.' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const user = await UserTenant.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (req.user.role !== 'dev' && user.tenantId?.toString() !== req.user.tenantId?.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    user.isActive = !user.isActive;
    await user.save();

    return res.status(200).json({
      success: true,
      data: user,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const fetchTenantActivityLogs = async (req, res) => {
  try {
    if (req.user.role !== 'dev' && req.user.tenantId?.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const logs = await TenantActivityLogs.find({ tenantId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('userTenantId', 'firstName lastName email role')
      .lean();

    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch activity logs' });
  }
};

/**
 * PDPA — Export all personal data for a patient.
 * GET /api/auth-tenant/:id/export
 * Accessible by: the patient themselves OR admin/superadmin of the same tenant.
 */
const exportPatientData = async (req, res) => {
  try {
    const targetId = req.params.id;
    const requester = req.user;

    const target = await UserTenant.findById(targetId)
      .select('-password -resetToken -resetTokenExpiry -verificationToken -verificationTokenExpiry')
      .lean();
    if (!target) return res.status(404).json({ message: 'User not found' });

    const isSelf  = String(requester.id) === String(targetId);
    const isAdmin = ['admin', 'superadmin', 'dev'].includes(requester.role) &&
                    String(requester.tenantId) === String(target.tenantId);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const conversation = await Conversation.findOne({ patientId: targetId }).select('_id').lean();
    const [appointments, messages] = await Promise.all([
      Appointment.find({ patientId: targetId })
        .select('-tenantId -__v')
        .sort({ createdAt: -1 })
        .lean(),
      conversation
        ? Message.find({ conversationId: conversation._id }).select('-__v').lean()
        : Promise.resolve([]),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      notice: 'This export was generated in compliance with the Philippine Data Privacy Act (PDPA / RA 10173).',
      profile: target,
      appointments,
      messages,
    };

    res.setHeader('Content-Disposition', `attachment; filename="patient-data-${targetId}.json"`);
    res.setHeader('Content-Type', 'application/json');
    return res.json(exportPayload);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PDPA — Anonymize all personal data for a patient (right to erasure).
 * DELETE /api/auth-tenant/:id/data
 * Accessible by: the patient themselves OR admin/superadmin of the same tenant.
 * Record is preserved for referential integrity; all PII is overwritten.
 */
const anonymizePatientData = async (req, res) => {
  try {
    const targetId = req.params.id;
    const requester = req.user;

    const target = await UserTenant.findById(targetId);
    if (!target) return res.status(404).json({ message: 'User not found' });

    const isSelf  = String(requester.id) === String(targetId);
    const isAdmin = ['admin', 'superadmin', 'dev'].includes(requester.role) &&
                    String(requester.tenantId) === String(target.tenantId);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const stub = `deleted_${targetId}`;
    target.firstName  = 'Deleted';
    target.lastName   = 'User';
    target.middleName = '';
    target.email      = `${stub}@anonymized.invalid`;
    target.phone      = '';
    target.birthday   = '';
    target.pin        = '';
    target.profilePhoto = { url: '', publicId: '' };
    target.isActive   = false;
    target.isEmailVerified = false;
    await target.save();

    // Anonymize conversation references
    await Conversation.updateMany(
      { patientId: targetId },
      { $set: { patientName: 'Deleted User', patientEmail: `${stub}@anonymized.invalid` } }
    );

    return res.json({
      success: true,
      message: 'All personal data has been anonymized in compliance with the Philippine Data Privacy Act (PDPA).',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Dual Verification — Path A: Clinic-managed verification.
 * Used when a patient has no personal email — clinic staff verifies identity in person.
 * PATCH /api/auth-tenant/:id/clinic-verify
 * Accessible by: admin, superadmin, dev of the same tenant.
 */
const clinicVerifyPatient = async (req, res) => {
  try {
    const target = await UserTenant.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    if (req.user.role !== 'dev' && target.tenantId?.toString() !== req.user.tenantId?.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (target.role !== 'patient') {
      return res.status(400).json({ message: 'Only patient accounts can be clinic-verified.' });
    }

    target.isEmailVerified = true;
    target.verificationMethod = 'clinic';
    target.verificationToken = null;
    target.verificationTokenExpiry = null;
    await target.save();

    return res.status(200).json({
      success: true,
      message: 'Patient account verified by clinic staff.',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
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
  clinicVerifyPatient,
};

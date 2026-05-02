const mongoose = require('mongoose');

const UserTenantSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  username: {
    type: String,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  otherEmail: {
    type: String,
    unique: true,
  },
  pin:        { type: String },
  firstName:  { type: String },
  middleName: { type: String },
  lastName:   { type: String },
  birthday:   { type: String },
  phone:      { type: String },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['patient', 'admin', 'superadmin', 'dev'],
    default: 'patient',
  },
  type: { type: String, default: 'tenant' },
  profilePhoto: {
    url:      { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  isActive:       { type: Boolean, default: true },
  isEmailVerified:{ type: Boolean, default: true},
  // 'self' = patient clicked email link; 'clinic' = staff verified in person
  verificationMethod: { type: String, enum: ['self', 'clinic'], default: 'self' },
  verificationToken:       { type: String, default: null },
  verificationTokenExpiry: { type: Date,   default: null },
  resetToken:       { type: String, default: null },
  resetTokenExpiry: { type: Date,   default: null },
}, { timestamps: true });

UserTenantSchema.index({ tenantId: 1 });

module.exports = mongoose.model('UserTenant', UserTenantSchema);

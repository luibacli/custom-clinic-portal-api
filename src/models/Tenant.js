const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  domain: { type: String, required: true },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  tenantLogo: {
    url:      { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  features: {
    messaging:     { type: Boolean, default: true  },
    appointments:  { type: Boolean, default: true  },
    qrScan:        { type: Boolean, default: true  },
    mails:         { type: Boolean, default: true  },
    verifications: { type: Boolean, default: false },
    users:         { type: Boolean, default: true  },
    analytics:     { type: Boolean, default: false },
    exportReports: { type: Boolean, default: false },
    smsReminders:  { type: Boolean, default: false },
  },
  branding: {
    primaryColor:   { type: String, default: '#2563eb' },
    address:        { type: String, default: '' },
    phone:          { type: String, default: '' },
    email:          { type: String, default: '' },
    welcomeMessage: { type: String, default: '' },
  },
  subscription: {
    plan: {
      type:    String,
      enum:    ['starter', 'growth', 'premium'],
      default: 'starter',
    },
    status: {
      type:    String,
      enum:    ['trial', 'active', 'past_due', 'suspended', 'cancelled'],
      default: 'trial',
    },
    trialEndsAt:      { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    currentPeriodEnd: { type: Date, default: null },
    paymongoPaymentId:   { type: String, default: '' },
    paymongoCustomerId:  { type: String, default: '' },
  },
}, { timestamps: true });

tenantSchema.index({ domain: 1 }, { unique: true });

module.exports = mongoose.model('Tenant', tenantSchema);

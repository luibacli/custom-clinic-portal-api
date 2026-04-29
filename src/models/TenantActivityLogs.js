const mongoose = require('mongoose');

const TenantActivityLogSchema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  userTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserTenant', required: true },
  role:         { type: String },
  ipAddress:    { type: String },
  action:       { type: String, enum: ['LOGIN', 'LOGOUT'], required: true },
  status:       { type: String, enum: ['SUCCESS', 'FAILED'], default: 'SUCCESS' },
  timestamp:    { type: Date, default: Date.now },
});

TenantActivityLogSchema.index({ tenantId: 1, timestamp: -1 });

module.exports = mongoose.model('TenantActivityLogs', TenantActivityLogSchema);

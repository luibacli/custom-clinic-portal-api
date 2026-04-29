const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  tenantId:    { type: String, required: true },
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
  order:       { type: Number, default: 0 },
}, { timestamps: true });

serviceSchema.index({ tenantId: 1, order: 1 });

module.exports = mongoose.model('Service', serviceSchema);

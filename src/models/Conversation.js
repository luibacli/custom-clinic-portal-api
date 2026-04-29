const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  tenantId:      { type: String, required: true },
  patientId:     { type: mongoose.Schema.Types.ObjectId, required: true },
  patientName:   { type: String, required: true },
  patientEmail:  { type: String, default: '' },
  lastMessage:   { type: String, default: '' },
  lastMessageAt: { type: Date, default: null },
  lastSenderId:  { type: mongoose.Schema.Types.ObjectId, default: null },
  patientUnread: { type: Number, default: 0 },
  adminUnread:   { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['active', 'closed'],
    default: 'active',
  },
}, { timestamps: true });

ConversationSchema.index({ tenantId: 1, patientId: 1 }, { unique: true });
ConversationSchema.index({ tenantId: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', ConversationSchema);

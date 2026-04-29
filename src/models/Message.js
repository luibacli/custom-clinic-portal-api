const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId:       { type: mongoose.Schema.Types.ObjectId, required: true },
  senderRole:     { type: String, required: true },
  senderName:     { type: String, required: true },
  content:        { type: String, required: true },
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);

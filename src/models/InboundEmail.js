const mongoose = require('mongoose');

const InboundEmailSchema = new mongoose.Schema({
  from:           { type: String },
  to:             { type: String },
  subject:        { type: String },
  text:           { type: String },
  html:           { type: String },
  date:           { type: Date },
  raw:            { type: String },
  activationLink: { type: String },
  status: {
    type: String,
    enum: ['pending', 'created'],
    default: 'pending',
  },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

InboundEmailSchema.index({ to: 1, date: -1 });

module.exports = mongoose.model('InboundEmail', InboundEmailSchema);

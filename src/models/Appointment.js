const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  tenantId:        { type: String, required: true },
  patientId:       { type: mongoose.Schema.Types.ObjectId, required: true },
  patientName:     { type: String, required: true },
  patientEmail:    { type: String, default: '' },
  serviceType:     { type: String, required: true },
  appointmentDate: { type: Date, required: true },
  notes:           { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in-queue', 'ongoing', 'completed', 'cancelled'],
    default: 'pending',
  },
  queueNumber:  { type: Number, default: null },
  adminNotes:   { type: String, default: '' },
  cancelReason: { type: String, default: '' },
}, { timestamps: true });

AppointmentSchema.index({ tenantId: 1, appointmentDate: 1 });
AppointmentSchema.index({ tenantId: 1, status: 1 });
AppointmentSchema.index({ patientId: 1 });

module.exports = mongoose.model('Appointment', AppointmentSchema);

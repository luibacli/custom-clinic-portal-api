const express = require('express');
const router = express.Router();
const auth                 = require('../middleware/auth');
const requireSubscription  = require('../middleware/requireSubscription');
const {
  createAppointment,
  fetchMyAppointments,
  fetchAllAppointments,
  fetchQueueStatus,
  manageAppointment,
  cancelAppointment,
} = require('../controllers/appointmentController');

const gate = [auth(), requireSubscription];

router.post('/',                      ...gate, createAppointment);
router.get('/my',                     ...gate, fetchMyAppointments);
router.get('/:tenantId/all',          ...gate, fetchAllAppointments);
router.get('/:tenantId/queue',        ...gate, fetchQueueStatus);
router.patch('/:id/manage',           ...gate, manageAppointment);
router.patch('/:id/cancel',           ...gate, cancelAppointment);

module.exports = router;

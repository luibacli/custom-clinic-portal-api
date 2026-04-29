const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createAppointment,
  fetchMyAppointments,
  fetchAllAppointments,
  fetchQueueStatus,
  manageAppointment,
  cancelAppointment,
} = require('../controllers/appointmentController');

router.post('/',                      auth(), createAppointment);
router.get('/my',                     auth(), fetchMyAppointments);
router.get('/:tenantId/all',          auth(), fetchAllAppointments);
router.get('/:tenantId/queue',        auth(), fetchQueueStatus);
router.patch('/:id/manage',           auth(), manageAppointment);
router.patch('/:id/cancel',           auth(), cancelAppointment);

module.exports = router;

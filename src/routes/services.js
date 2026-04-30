const express = require('express');
const router = express.Router();
const auth                = require('../middleware/auth');
const requireSubscription = require('../middleware/requireSubscription');
const {
  getServices,
  createService,
  updateService,
  deleteService,
  seedDefaultServices,
} = require('../controllers/serviceController');

const gate = [auth(), requireSubscription];

router.get('/:tenantId',           ...gate, getServices);
router.post('/:tenantId',          ...gate, createService);
router.post('/:tenantId/seed',     ...gate, seedDefaultServices);
router.patch('/:id',               ...gate, updateService);
router.delete('/:id',              ...gate, deleteService);

module.exports = router;

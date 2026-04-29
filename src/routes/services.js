const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getServices,
  createService,
  updateService,
  deleteService,
  seedDefaultServices,
} = require('../controllers/serviceController');

router.get('/:tenantId',           auth(), getServices);
router.post('/:tenantId',          auth(), createService);
router.post('/:tenantId/seed',     auth(), seedDefaultServices);
router.patch('/:id',               auth(), updateService);
router.delete('/:id',              auth(), deleteService);

module.exports = router;

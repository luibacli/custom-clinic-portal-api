const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getTenantAnalytics } = require('../controllers/analyticsController');

router.get('/:tenantId', auth(['admin', 'superadmin']), getTenantAnalytics);

module.exports = router;

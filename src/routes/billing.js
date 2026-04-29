const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
  createCheckout,
  handleWebhook,
  getSubscriptionStatus,
  setPlan,
} = require('../controllers/billingController');

// Webhook must use raw body — registered before json() middleware in app.js
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Tenant-facing
router.post('/checkout', auth(), createCheckout);
router.get('/status',    auth(), getSubscriptionStatus);

// Dev/internal only
router.patch('/set-plan', auth(['dev']), setPlan);

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  receiveEmail,
  fetchInbox,
  fetchEmailsByTenant,
  fetchLinksByTenant,
  fetchEmailById,
  fetchEmailsByAddress,
  updateEmailStatus,
  markEmailRead,
} = require('../controllers/emailController');

router.post('/receive',           receiveEmail);
router.get('/inbox',              auth(), fetchInbox);
router.get('/emails/:to',         auth(), fetchEmailsByAddress);
router.get('/:id/',               auth(), fetchEmailsByTenant);
router.get('/:id/links',          auth(), fetchLinksByTenant);
router.get('/:id/email',          auth(), fetchEmailById);
router.put('/:id/email/update',   auth(), updateEmailStatus);
router.patch('/:id/read',         auth(), markEmailRead);

module.exports = router;

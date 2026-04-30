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

const MAIL_ROLES = ['admin', 'superadmin', 'dev'];

router.post('/receive',           receiveEmail);
router.get('/inbox',              auth(MAIL_ROLES), fetchInbox);
router.get('/emails/:to',         auth(MAIL_ROLES), fetchEmailsByAddress);
router.get('/:id/',               auth(MAIL_ROLES), fetchEmailsByTenant);
router.get('/:id/links',          auth(MAIL_ROLES), fetchLinksByTenant);
router.get('/:id/email',          auth(MAIL_ROLES), fetchEmailById);
router.put('/:id/email/update',   auth(MAIL_ROLES), updateEmailStatus);
router.patch('/:id/read',         auth(MAIL_ROLES), markEmailRead);

module.exports = router;

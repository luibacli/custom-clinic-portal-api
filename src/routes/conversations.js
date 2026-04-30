const express = require('express');
const router = express.Router();
const auth                = require('../middleware/auth');
const requireSubscription = require('../middleware/requireSubscription');
const {
  initConversation,
  fetchMyConversation,
  fetchAllConversations,
  fetchMessages,
  sendMessage,
  markConversationRead,
} = require('../controllers/conversationController');

const gate = [auth(), requireSubscription];

router.post('/',                       ...gate, initConversation);
router.get('/my',                      ...gate, fetchMyConversation);
router.get('/:tenantId/all',           ...gate, fetchAllConversations);
router.get('/:id/messages',            ...gate, fetchMessages);
router.post('/:id/messages',           ...gate, sendMessage);
router.patch('/:id/read',              ...gate, markConversationRead);

module.exports = router;

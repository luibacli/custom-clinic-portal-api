const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  initConversation,
  fetchMyConversation,
  fetchAllConversations,
  fetchMessages,
  sendMessage,
  markConversationRead,
} = require('../controllers/conversationController');

router.post('/',                       auth(), initConversation);
router.get('/my',                      auth(), fetchMyConversation);
router.get('/:tenantId/all',           auth(), fetchAllConversations);
router.get('/:id/messages',            auth(), fetchMessages);
router.post('/:id/messages',           auth(), sendMessage);
router.patch('/:id/read',              auth(), markConversationRead);

module.exports = router;

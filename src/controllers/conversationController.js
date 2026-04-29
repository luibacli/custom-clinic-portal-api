const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const UserTenant = require('../models/UserTenant');

const getFullName = (u) =>
  [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ') || u.email;

const initConversation = async (req, res) => {
  try {
    const user = await UserTenant.findById(req.user.id).lean();
    if (!user || user.role !== 'patient') {
      return res.status(403).json({ success: false, message: 'Patients only' });
    }

    let conv = await Conversation.findOne({ tenantId: user.tenantId, patientId: user._id });
    if (!conv) {
      conv = await Conversation.create({
        tenantId:     user.tenantId,
        patientId:    user._id,
        patientName:  getFullName(user),
        patientEmail: user.email,
      });
    }
    res.json({ success: true, data: conv });
  } catch (error) {
    if (error.code === 11000) {
      const user = await UserTenant.findById(req.user.id).lean();
      const conv = await Conversation.findOne({ tenantId: user.tenantId, patientId: user._id });
      return res.json({ success: true, data: conv });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

const fetchMyConversation = async (req, res) => {
  try {
    const user = await UserTenant.findById(req.user.id).lean();
    if (!user) return res.status(403).json({ success: false, message: 'Forbidden' });

    const conv = await Conversation.findOne({ tenantId: user.tenantId, patientId: user._id }).lean();
    res.json({ success: true, data: conv });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const fetchAllConversations = async (req, res) => {
  try {
    const admin = await UserTenant.findById(req.user.id).lean();
    if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const convs = await Conversation.find({ tenantId: req.params.tenantId })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ success: true, data: convs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const fetchMessages = async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id).lean();
    if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

    const isOwner = conv.patientId?.toString() === req.user.id?.toString();

    if (!isOwner) {
      const user = await UserTenant.findById(req.user.id).select('role tenantId').lean();
      if (!user) return res.status(403).json({ success: false, message: 'Forbidden' });
      const isAdmin =
        ['admin', 'superadmin'].includes(user.role) &&
        conv.tenantId?.toString() === user.tenantId?.toString();
      if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { before, limit = 60 } = req.query;
    const filter = { conversationId: req.params.id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const msgs = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 100))
      .lean();

    res.json({ success: true, data: msgs.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

    const isOwner = conv.patientId?.toString() === req.user.id?.toString();
    const user = await UserTenant.findById(req.user.id).lean();
    if (!user) return res.status(403).json({ success: false, message: 'Forbidden' });

    if (!isOwner) {
      const isAdmin =
        ['admin', 'superadmin'].includes(user.role) &&
        conv.tenantId?.toString() === user.tenantId?.toString();
      if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const msg = await Message.create({
      conversationId: conv._id,
      senderId:       user._id,
      senderRole:     user.role,
      senderName:     getFullName(user),
      content:        content.trim(),
    });

    const convUpdate = {
      $set: {
        lastMessage:   content.trim().substring(0, 120),
        lastMessageAt: new Date(),
        lastSenderId:  user._id,
      },
    };

    if (user.role === 'patient') {
      convUpdate.$set.patientUnread = 0;
      convUpdate.$inc = { adminUnread: 1 };
    } else {
      convUpdate.$set.adminUnread = 0;
      convUpdate.$inc = { patientUnread: 1 };
    }

    await Conversation.findByIdAndUpdate(conv._id, convUpdate);

    res.status(201).json({ success: true, data: msg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const markConversationRead = async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

    const isOwner = conv.patientId?.toString() === req.user.id?.toString();
    const user = await UserTenant.findById(req.user.id).select('role tenantId').lean();
    if (!user) return res.status(403).json({ success: false, message: 'Forbidden' });

    if (!isOwner) {
      const isAdmin =
        ['admin', 'superadmin'].includes(user.role) &&
        conv.tenantId?.toString() === user.tenantId?.toString();
      if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const update = isOwner ? { patientUnread: 0 } : { adminUnread: 0 };
    await Conversation.findByIdAndUpdate(conv._id, update);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  initConversation,
  fetchMyConversation,
  fetchAllConversations,
  fetchMessages,
  sendMessage,
  markConversationRead,
};

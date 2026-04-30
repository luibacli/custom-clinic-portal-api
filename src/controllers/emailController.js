const { simpleParser } = require('mailparser');
const InboundEmail = require('../models/InboundEmail');
const Tenant = require('../models/Tenant');

const extractActivationLink = (html = '', text = '') => {
  const source = String(html || text || '');
  const match = source.match(
    /https:\/\/memberinquiry\.philhealth\.gov\.ph\/member\/accountActivated\.xhtml\?activationCode=[A-Za-z0-9]+/i
  );
  return match ? match[0] : '';
};

// Returns the caller's tenant domain regex, or null for dev (unrestricted).
const getCallerDomainRegex = async (tenantId) => {
  if (!tenantId) return null;
  const tenant = await Tenant.findById(tenantId).select('domain').lean();
  if (!tenant?.domain) return null;
  const escaped = tenant.domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${escaped}$`, 'i');
};

const receiveEmail = async (req, res) => {
  try {
    const secret = req.header('x-secret');
    if (secret !== process.env.EMAIL_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const { from, to, raw } = req.body || {};
    if (!raw) return res.status(400).json({ ok: false, error: 'Missing raw' });

    const parsed = await simpleParser(raw);
    const activationLink = extractActivationLink(parsed.html, parsed.text);

    const doc = await InboundEmail.create({
      from, to,
      subject: parsed.subject || '',
      date:    parsed.date   || new Date(),
      text:    parsed.text   || '',
      html:    parsed.html   || '',
      activationLink,
      raw,
      status: 'pending',
      isRead: false,
    });

    return res.json({ ok: true, id: doc._id, activationLink });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};

const fetchInbox = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip  = (page - 1) * limit;

    const domainRegex = await getCallerDomainRegex(req.user?.tenantId);
    const filter = domainRegex ? { to: domainRegex } : {};

    const [total, emails] = await Promise.all([
      InboundEmail.countDocuments(filter),
      InboundEmail.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .select('-raw')
        .lean(),
    ]);

    if (!emails.length) return res.status(404).json({ message: 'No messages found' });
    res.status(200).json({ success: true, data: emails, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const fetchEmailsByTenant = async (req, res) => {
  try {
    if (req.user.role !== 'dev' && req.user.tenantId?.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant Not Found' });
    if (!tenant.domain) return res.status(400).json({ message: 'Tenant domain is missing' });

    const escapedDomain = tenant.domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const domainRegex = new RegExp(`@${escapedDomain}$`, 'i');

    const emails = await InboundEmail.find({
      $or: [{ to: domainRegex }, { from: domainRegex }],
    }).sort({ date: -1 });

    res.status(200).json({ tenant: tenant.name, domain: tenant.domain, count: emails.length, emails });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch emails', error: error.message });
  }
};

const fetchLinksByTenant = async (req, res) => {
  try {
    if (req.user.role !== 'dev' && req.user.tenantId?.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant Not Found' });
    if (!tenant.domain) return res.status(400).json({ message: 'Tenant domain is missing' });

    const escapedDomain = tenant.domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const domainRegex = new RegExp(`@${escapedDomain}$`, 'i');

    const emails = await InboundEmail.find({
      to: domainRegex,
      activationLink: { $exists: true, $nin: [null, '', ' '] },
      status: 'pending',
    }).sort({ date: -1 });

    res.status(200).json({ tenant: tenant.name, domain: tenant.domain, count: emails.length, emails });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch links', error: error.message });
  }
};

const fetchEmailById = async (req, res) => {
  try {
    const email = await InboundEmail.findById(req.params.id);
    if (!email) return res.status(404).json({ message: 'No Email Found' });

    const domainRegex = await getCallerDomainRegex(req.user?.tenantId);
    if (domainRegex && !domainRegex.test(email.to) && !domainRegex.test(email.from)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.status(200).json(email);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch email' });
  }
};

const fetchEmailsByAddress = async (req, res) => {
  try {
    const domainRegex = await getCallerDomainRegex(req.user?.tenantId);
    if (domainRegex && !domainRegex.test(req.params.to)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const emails = await InboundEmail.find({ to: req.params.to });
    if (!emails.length) return res.status(404).json({ message: 'Emails not found' });
    res.status(200).json(emails);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

const updateEmailStatus = async (req, res) => {
  try {
    const email = await InboundEmail.findById(req.params.id);
    if (!email) return res.status(404).json({ message: 'Email not found' });

    const domainRegex = await getCallerDomainRegex(req.user?.tenantId);
    if (domainRegex && !domainRegex.test(email.to) && !domainRegex.test(email.from)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { status } = req.body;
    const updated = await InboundEmail.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Email update error', error: error.message });
  }
};

const markEmailRead = async (req, res) => {
  try {
    const email = await InboundEmail.findById(req.params.id);
    if (!email) return res.status(404).json({ message: 'Email not found' });

    const domainRegex = await getCallerDomainRegex(req.user?.tenantId);
    if (domainRegex && !domainRegex.test(email.to) && !domainRegex.test(email.from)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    email.isRead = true;
    await email.save();
    res.json(email);
  } catch (error) {
    res.status(500).json({ message: 'Error updating email' });
  }
};

module.exports = {
  receiveEmail,
  fetchInbox,
  fetchEmailsByTenant,
  fetchLinksByTenant,
  fetchEmailById,
  fetchEmailsByAddress,
  updateEmailStatus,
  markEmailRead,
};

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

const fetchInbox = async (_req, res) => {
  try {
    const emails = await InboundEmail.find().sort({ date: -1 });
    if (!emails.length) return res.status(404).json({ message: 'No messages found' });
    res.status(200).json(emails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const fetchEmailsByTenant = async (req, res) => {
  try {
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
    res.status(200).json(email);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch email' });
  }
};

const fetchEmailsByAddress = async (req, res) => {
  try {
    const emails = await InboundEmail.find({ to: req.params.to });
    if (!emails.length) return res.status(404).json({ message: 'Emails not found' });
    res.status(200).json(emails);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

const updateEmailStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await InboundEmail.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Email not found' });
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Email update error', error: error.message });
  }
};

const markEmailRead = async (req, res) => {
  try {
    const email = await InboundEmail.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!email) return res.status(404).json({ message: 'Email not found' });
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

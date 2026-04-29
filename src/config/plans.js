const PLANS = {
  starter: {
    name:         'Starter',
    patientLimit: 500,
    userLimit:    2,
    price: { monthly: 149900, annual: 1499000 }, // centavos
    features: {
      messaging:     false,
      appointments:  false,
      qrScan:        false,
      mails:         false,
      users:         true,
      analytics:     false,
      exportReports: false,
      smsReminders:  false,
    },
  },
  growth: {
    name:         'Growth',
    patientLimit: 2000,
    userLimit:    5,
    price: { monthly: 299900, annual: 2899000 },
    features: {
      messaging:     true,
      appointments:  true,
      qrScan:        true,
      mails:         true,
      users:         true,
      analytics:     false,
      exportReports: false,
      smsReminders:  false,
    },
  },
  premium: {
    name:         'Premium',
    patientLimit: null, // unlimited
    userLimit:    null, // unlimited
    price: { monthly: 549900, annual: 5499000 },
    features: {
      messaging:     true,
      appointments:  true,
      qrScan:        true,
      mails:         true,
      users:         true,
      analytics:     true,
      exportReports: true,
      smsReminders:  false, // future: SMS gateway integration
    },
  },
};

module.exports = PLANS;

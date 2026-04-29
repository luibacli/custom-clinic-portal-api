/**
 * Development seed script.
 * Creates test tenants, users, services, and sample appointments.
 * Safe to run multiple times — skips records that already exist.
 *
 * Usage:
 *   node scripts/seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Tenant      = require('../src/models/Tenant');
const UserTenant  = require('../src/models/UserTenant');
const Service     = require('../src/models/Service');
const Appointment = require('../src/models/Appointment');

const DEFAULT_PASSWORD = 'pass123';
const DEFAULT_SERVICES = [
  'General Consultation', 'Follow-up Checkup', 'Laboratory Request',
  'Prescription Renewal', 'Vaccination', 'Medical Certificate', 'Others',
];

// ─── Tenant definitions ──────────────────────────────────────────────────────
const TENANTS = [
  {
    name:   'Prima Well Medical Center',
    domain: 'primawellmc.myclinicaccess.com',
    status: 'active',
    branding: {
      primaryColor:   '#0ea5e9',
      phone:          '+63 2 8123 4567',
      email:          'contact@primawellmc.test',
      address:        '123 Rizal Ave, Makati City, Metro Manila',
      welcomeMessage: 'Welcome to Prima Well Medical Center — your health, our priority.',
    },
    features: {
      messaging: true, appointments: true, qrScan: true,
      mails: true, users: true, analytics: true, exportReports: false, smsReminders: false,
    },
    subscription: { plan: 'growth', status: 'active', currentPeriodEnd: new Date('2025-12-31') },
  },
  {
    name:   'Dongon Medical Clinic',
    domain: 'dongonmc.myclinicaccess.com',
    status: 'active',
    branding: {
      primaryColor:   '#10b981',
      phone:          '+63 32 234 5678',
      email:          'hello@dongonmc.test',
      address:        '456 Cebu Street, Cebu City',
      welcomeMessage: 'Dongon Medical Clinic — caring for families since 2010.',
    },
    features: {
      messaging: false, appointments: true, qrScan: true,
      mails: false, users: true, analytics: false, exportReports: false, smsReminders: false,
    },
    subscription: { plan: 'starter', status: 'trial', trialEndsAt: new Date(Date.now() + 20 * 864e5) },
  },
  {
    name:   'Santos Family Clinic',
    domain: 'santosfamily.myclinicaccess.com',
    status: 'active',
    branding: {
      primaryColor:   '#8b5cf6',
      phone:          '+63 82 345 6789',
      email:          'admin@santosfamily.test',
      address:        '789 Davao Road, Davao City',
      welcomeMessage: 'Santos Family Clinic — complete care for the whole family.',
    },
    features: {
      messaging: true, appointments: true, qrScan: true,
      mails: true, users: true, analytics: true, exportReports: true, smsReminders: false,
    },
    subscription: { plan: 'premium', status: 'active', currentPeriodEnd: new Date('2026-06-30') },
  },
];

// ─── Users per tenant (tenantId filled in after tenant is created) ────────────
const TENANT_USERS = [
  // ── Prima Well ──
  {
    tenant: 'primawellmc.myclinicaccess.com',
    role: 'superadmin',
    firstName: 'Ricardo', lastName: 'Dela Cruz', email: 'owner@primawellmc.test',
    phone: '+63 917 111 0001', birthday: '1978-04-15', pin: 'PW-SA-001',
    isEmailVerified: true,
  },
  {
    tenant: 'primawellmc.myclinicaccess.com',
    role: 'admin',
    firstName: 'Lorna', lastName: 'Reyes', email: 'staff@primawellmc.test',
    phone: '+63 917 111 0002', birthday: '1990-08-22', pin: 'PW-AD-002',
    isEmailVerified: true,
  },
  {
    tenant: 'primawellmc.myclinicaccess.com',
    role: 'patient',
    firstName: 'Juan', lastName: 'Santos', email: 'juan.santos@primawellmc.test',
    phone: '+63 917 222 0001', birthday: '1995-03-10', pin: 'PW-PT-001',
    isEmailVerified: true,
  },
  {
    tenant: 'primawellmc.myclinicaccess.com',
    role: 'patient',
    firstName: 'Maria', lastName: 'Garcia', email: 'maria.garcia@primawellmc.test',
    phone: '+63 917 222 0002', birthday: '2000-11-05', pin: 'PW-PT-002',
    isEmailVerified: true,
  },
  {
    tenant: 'primawellmc.myclinicaccess.com',
    role: 'patient',
    firstName: 'Pedro', lastName: 'Mendoza', email: 'pedro.mendoza@primawellmc.test',
    phone: '+63 917 222 0003', birthday: '1988-07-19', pin: 'PW-PT-003',
    isEmailVerified: false,
  },
  {
    tenant: 'primawellmc.myclinicaccess.com',
    role: 'patient',
    firstName: 'Ana', lastName: 'Torres', email: 'ana.torres@primawellmc.test',
    phone: '+63 917 222 0004', birthday: '1992-01-30', pin: 'PW-PT-004',
    isEmailVerified: true,
  },

  // ── Dongon ──
  {
    tenant: 'dongonmc.myclinicaccess.com',
    role: 'superadmin',
    firstName: 'Ernesto', lastName: 'Dongon', email: 'owner@dongonmc.test',
    phone: '+63 918 111 0001', birthday: '1970-06-01', pin: 'DM-SA-001',
    isEmailVerified: true,
  },
  {
    tenant: 'dongonmc.myclinicaccess.com',
    role: 'admin',
    firstName: 'Cora', lastName: 'Villanueva', email: 'staff@dongonmc.test',
    phone: '+63 918 111 0002', birthday: '1985-09-14', pin: 'DM-AD-002',
    isEmailVerified: true,
  },
  {
    tenant: 'dongonmc.myclinicaccess.com',
    role: 'patient',
    firstName: 'Jose', lastName: 'Cruz', email: 'jose.cruz@dongonmc.test',
    phone: '+63 918 222 0001', birthday: '1997-12-25', pin: 'DM-PT-001',
    isEmailVerified: true,
  },
  {
    tenant: 'dongonmc.myclinicaccess.com',
    role: 'patient',
    firstName: 'Elena', lastName: 'Lim', email: 'elena.lim@dongonmc.test',
    phone: '+63 918 222 0002', birthday: '2003-05-18', pin: 'DM-PT-002',
    isEmailVerified: false,
  },
  {
    tenant: 'dongonmc.myclinicaccess.com',
    role: 'patient',
    firstName: 'Carlos', lastName: 'Aquino', email: 'carlos.aquino@dongonmc.test',
    phone: '+63 918 222 0003', birthday: '1980-02-08', pin: 'DM-PT-003',
    isEmailVerified: true,
  },

  // ── Santos Family ──
  {
    tenant: 'santosfamily.myclinicaccess.com',
    role: 'superadmin',
    firstName: 'Gloria', lastName: 'Santos', email: 'owner@santosfamily.test',
    phone: '+63 919 111 0001', birthday: '1975-10-20', pin: 'SF-SA-001',
    isEmailVerified: true,
  },
  {
    tenant: 'santosfamily.myclinicaccess.com',
    role: 'admin',
    firstName: 'Ramon', lastName: 'Bautista', email: 'staff@santosfamily.test',
    phone: '+63 919 111 0002', birthday: '1993-04-03', pin: 'SF-AD-002',
    isEmailVerified: true,
  },
  {
    tenant: 'santosfamily.myclinicaccess.com',
    role: 'patient',
    firstName: 'Rosa', lastName: 'Diaz', email: 'rosa.diaz@santosfamily.test',
    phone: '+63 919 222 0001', birthday: '1991-08-12', pin: 'SF-PT-001',
    isEmailVerified: true,
  },
  {
    tenant: 'santosfamily.myclinicaccess.com',
    role: 'patient',
    firstName: 'Miguel', lastName: 'Tan', email: 'miguel.tan@santosfamily.test',
    phone: '+63 919 222 0002', birthday: '1999-03-27', pin: 'SF-PT-002',
    isEmailVerified: true,
  },
  {
    tenant: 'santosfamily.myclinicaccess.com',
    role: 'patient',
    firstName: 'Luz', lastName: 'Fernandez', email: 'luz.fernandez@santosfamily.test',
    phone: '+63 919 222 0003', birthday: '1986-11-09', pin: 'SF-PT-003',
    isEmailVerified: false,
  },
];

// ─── Dev account (no tenant) ─────────────────────────────────────────────────
const DEV_USER = {
  email:      'dev@myclinicaccess.test',
  firstName:  'Dev',
  lastName:   'Admin',
  role:       'dev',
  phone:      '+63 900 000 0000',
  birthday:   '1990-01-01',
  pin:        'DEV-001',
  isEmailVerified: true,
};

// ─── Sample appointments (relative dates) ────────────────────────────────────
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const log  = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  – ${msg} (already exists, skipped)`);
const section = (title) => console.log(`\n[${'='.repeat(50)}]\n  ${title}\n[${'='.repeat(50)}]`);

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('\n  Connected to MongoDB');

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // ── 1. Tenants ──
  section('TENANTS');
  const tenantMap = {};

  for (const def of TENANTS) {
    let tenant = await Tenant.findOne({ domain: def.domain });
    if (tenant) {
      skip(def.name);
    } else {
      tenant = await Tenant.create(def);
      log(`${def.name} — ${def.domain} [${def.subscription.plan}]`);
    }
    tenantMap[def.domain] = tenant;
  }

  // ── 2. Services ──
  section('SERVICES');
  for (const [domain, tenant] of Object.entries(tenantMap)) {
    const existing = await Service.countDocuments({ tenantId: String(tenant._id) });
    if (existing > 0) {
      skip(`Services for ${tenant.name} (${existing} already exist)`);
      continue;
    }
    await Service.insertMany(
      DEFAULT_SERVICES.map((name, i) => ({
        tenantId: String(tenant._id), name, isActive: true, order: i,
      }))
    );
    log(`${DEFAULT_SERVICES.length} services → ${tenant.name}`);
  }

  // ── 3. Tenant users ──
  section('TENANT USERS');
  const userMap = {};  // email → user document

  for (const def of TENANT_USERS) {
    const tenant = tenantMap[def.tenant];
    if (!tenant) { console.warn(`  ! No tenant found for ${def.tenant}`); continue; }

    let user = await UserTenant.findOne({ email: def.email });
    if (user) {
      skip(`${def.email} [${def.role}]`);
    } else {
      user = await UserTenant.create({
        tenantId:        tenant._id,
        email:           def.email,
        firstName:       def.firstName,
        lastName:        def.lastName,
        phone:           def.phone,
        birthday:        def.birthday,
        pin:             def.pin,
        role:            def.role,
        password:        hashedPassword,
        isEmailVerified: def.isEmailVerified,
        isActive:        true,
      });
      log(`${def.email} [${def.role}] → ${tenant.name}`);
    }
    userMap[def.email] = user;
  }

  // ── 4. Dev account ──
  section('DEV ACCOUNT');
  let devUser = await UserTenant.findOne({ email: DEV_USER.email });
  if (devUser) {
    skip(`${DEV_USER.email} [dev]`);
  } else {
    devUser = await UserTenant.create({
      email:           DEV_USER.email,
      firstName:       DEV_USER.firstName,
      lastName:        DEV_USER.lastName,
      phone:           DEV_USER.phone,
      birthday:        DEV_USER.birthday,
      pin:             DEV_USER.pin,
      role:            DEV_USER.role,
      password:        hashedPassword,
      isEmailVerified: DEV_USER.isEmailVerified,
      isActive:        true,
    });
    log(`${DEV_USER.email} [dev] — no tenant`);
  }

  // ── 5. Sample appointments (Prima Well only) ──
  section('SAMPLE APPOINTMENTS');
  const pw = tenantMap['primawellmc.myclinicaccess.com'];
  const patients = TENANT_USERS.filter(u => u.tenant === 'primawellmc.myclinicaccess.com' && u.role === 'patient');

  const sampleAppts = [
    { patient: patients[0], service: 'General Consultation', daysOffset: 0,  status: 'in-queue',  queueNumber: 3 },
    { patient: patients[1], service: 'Follow-up Checkup',    daysOffset: 0,  status: 'confirmed', queueNumber: null },
    { patient: patients[2], service: 'Laboratory Request',   daysOffset: 1,  status: 'pending',   queueNumber: null },
    { patient: patients[3], service: 'Prescription Renewal', daysOffset: -2, status: 'completed', queueNumber: 1 },
    { patient: patients[0], service: 'Vaccination',          daysOffset: 7,  status: 'pending',   queueNumber: null },
  ];

  let apptCreated = 0;
  for (const a of sampleAppts) {
    const user = userMap[a.patient.email];
    if (!user) continue;

    const existing = await Appointment.findOne({
      patientId: user._id,
      serviceType: a.service,
      appointmentDate: daysFromNow(a.daysOffset),
    });
    if (existing) { skip(`Appointment: ${a.patient.firstName} — ${a.service}`); continue; }

    await Appointment.create({
      tenantId:        String(pw._id),
      patientId:       user._id,
      patientName:     `${a.patient.firstName} ${a.patient.lastName}`,
      patientEmail:    a.patient.email,
      serviceType:     a.service,
      appointmentDate: daysFromNow(a.daysOffset),
      status:          a.status,
      queueNumber:     a.queueNumber,
      notes:           'Seeded appointment — for testing only.',
    });
    log(`Appointment: ${a.patient.firstName} ${a.patient.lastName} — ${a.service} [${a.status}]`);
    apptCreated++;
  }
  if (apptCreated === 0 && sampleAppts.length > 0) console.log('  – All sample appointments already exist');

  // ── Summary ──
  console.log(`
${'─'.repeat(56)}
  SEED COMPLETE
${'─'.repeat(56)}
  Default password : pass123
  Dev login        : dev@myclinicaccess.test / pass123

  TENANTS & LOGINS
  ┌─ Prima Well Medical Center (growth / active)
  │  superadmin  owner@primawellmc.test
  │  admin       staff@primawellmc.test
  │  patients    juan.santos@primawellmc.test
  │              maria.garcia@primawellmc.test
  │              pedro.mendoza@primawellmc.test
  │              ana.torres@primawellmc.test
  │
  ├─ Dongon Medical Clinic (starter / trial)
  │  superadmin  owner@dongonmc.test
  │  admin       staff@dongonmc.test
  │  patients    jose.cruz@dongonmc.test
  │              elena.lim@dongonmc.test
  │              carlos.aquino@dongonmc.test
  │
  └─ Santos Family Clinic (premium / active)
     superadmin  owner@santosfamily.test
     admin       staff@santosfamily.test
     patients    rosa.diaz@santosfamily.test
                 miguel.tan@santosfamily.test
                 luz.fernandez@santosfamily.test
${'─'.repeat(56)}
`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n  SEED FAILED:', err.message);
  mongoose.disconnect();
  process.exit(1);
});

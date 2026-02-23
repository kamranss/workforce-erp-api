const fs = require('fs');
const path = require('path');

function parseEnvFile(content) {
  const parsed = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (value.endsWith(';')) {
      value = value.slice(0, -1).trim();
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadLocalEnv() {
  const envCandidates = ['.env.local', '.env'];
  const root = process.cwd();

  for (const filename of envCandidates) {
    const envPath = path.join(root, filename);
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    const values = parseEnvFile(content);
    for (const [key, value] of Object.entries(values)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function getRequiredValue(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  loadLocalEnv();

  const { connectToDatabase } = require('../src/db/mongo');
  const { buildPassCodeCredentials, isValidRawPassCode } = require('../src/helpers/passcode');
  const { ROLE_SUPER_ADMIN } = require('../src/helpers/roles');
  const { User } = require('../src/models/User');

  const name = getRequiredValue('SEED_SUPERADMIN_NAME');
  const surname = getRequiredValue('SEED_SUPERADMIN_SURNAME');
  const email = getRequiredValue('SEED_SUPERADMIN_EMAIL').trim().toLowerCase();
  const passCode = getRequiredValue('SEED_SUPERADMIN_PASSCODE');
  const paymentOption = (process.env.SEED_SUPERADMIN_PAYMENT_OPTION || 'monthly').trim();
  const paymentAmount = Number(process.env.SEED_SUPERADMIN_PAYMENT_AMOUNT || 0);

  if (!isValidRawPassCode(passCode)) {
    throw new Error('SEED_SUPERADMIN_PASSCODE must be exactly 6 numeric digits.');
  }

  if (!['hourly', 'monthly'].includes(paymentOption)) {
    throw new Error('SEED_SUPERADMIN_PAYMENT_OPTION must be "hourly" or "monthly".');
  }

  if (Number.isNaN(paymentAmount) || paymentAmount < 0) {
    throw new Error('SEED_SUPERADMIN_PAYMENT_AMOUNT must be a number >= 0.');
  }

  await connectToDatabase();

  const existingSuperAdmin = await User.findOne({ role: ROLE_SUPER_ADMIN }).select('_id').exec();
  if (existingSuperAdmin) {
    console.log('Seed skipped: superAdmin already exists.');
    return;
  }

  const existingEmail = await User.findOne({ email }).select('_id').exec();
  if (existingEmail) {
    throw new Error(`Cannot seed: email already exists (${email}).`);
  }

  const credentials = await buildPassCodeCredentials(passCode);
  const passCodeConflict = await User.findOne({
    passCodeLookup: credentials.passCodeLookup,
    isActive: true
  })
    .select('_id')
    .exec();

  if (passCodeConflict) {
    throw new Error('Cannot seed: passCode already assigned to an active user.');
  }

  const user = await User.create({
    name: name.trim(),
    surname: surname.trim(),
    email,
    passCodeHash: credentials.passCodeHash,
    passCodeLookup: credentials.passCodeLookup,
    role: ROLE_SUPER_ADMIN,
    paymentOption,
    paymentAmount,
    isActive: true
  });

  console.log(`Seed complete: superAdmin created with id=${String(user._id)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exit(1);
  });

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

async function main() {
  loadLocalEnv();

  const { connectToDatabase } = require('../src/db/mongo');
  const { buildPassCodeCredentials, isValidRawPassCode } = require('../src/helpers/passcode');
  const { ROLE_USER } = require('../src/helpers/roles');
  const { User } = require('../src/models/User');

  const users = [
    {
      name: 'Hasan',
      surname: 'El Muhammed',
      email: 'hasan36x@icloud.com',
      passCode: '615084',
      paymentAmount: 28
    },
    {
      name: 'Oscar',
      surname: 'Ramirez',
      email: 'silvia_pollito@live.com',
      passCode: '854633',
      paymentAmount: 20
    },
    {
      name: 'Mehmet',
      surname: 'Oglu',
      email: 'moglu524@gmail.com',
      passCode: '424242',
      paymentAmount: 30
    },
    {
      name: 'Vilson',
      surname: 'Xavyer',
      email: 'wilsonfresneda03@gmail.com',
      passCode: '843910',
      paymentAmount: 25
    }
  ];

  await connectToDatabase();

  let insertedCount = 0;
  let skippedCount = 0;

  for (const entry of users) {
    if (!isValidRawPassCode(entry.passCode)) {
      throw new Error(`Invalid passCode for ${entry.email}: must be 6 numeric digits.`);
    }

    const email = entry.email.trim().toLowerCase();
    const existingByEmail = await User.findOne({ email }).select('_id').exec();
    if (existingByEmail) {
      skippedCount += 1;
      console.log(`Skipped ${email}: email already exists.`);
      continue;
    }

    const credentials = await buildPassCodeCredentials(entry.passCode);
    const existingByPassCode = await User.findOne({
      passCodeLookup: credentials.passCodeLookup,
      isActive: true
    })
      .select('_id')
      .exec();

    if (existingByPassCode) {
      skippedCount += 1;
      console.log(`Skipped ${email}: passCode already assigned to an active user.`);
      continue;
    }

    await User.create({
      name: entry.name,
      surname: entry.surname,
      email,
      passCodeHash: credentials.passCodeHash,
      passCodeLookup: credentials.passCodeLookup,
      role: ROLE_USER,
      paymentOption: 'hourly',
      paymentAmount: entry.paymentAmount,
      isActive: true
    });

    insertedCount += 1;
    console.log(`Inserted ${email}.`);
  }

  console.log(`Seed complete: inserted=${insertedCount}, skipped=${skippedCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exit(1);
  });

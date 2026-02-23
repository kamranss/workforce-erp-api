function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getJwtSecret() {
  const jwtSecret = getRequiredEnv('JWT_SECRET').trim();

  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }

  return jwtSecret;
}

const config = {
  mongodbUri: getRequiredEnv('MONGODB_URI'),
  mongodbDbName: process.env.MONGODB_DB_NAME || undefined,
  jwtSecret: getJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '60m'
};

module.exports = {
  config
};

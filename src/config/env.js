function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const config = {
  mongodbUri: getRequiredEnv('MONGODB_URI'),
  mongodbDbName: process.env.MONGODB_DB_NAME || undefined,
  jwtSecret: getRequiredEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '60m'
};

module.exports = {
  config
};

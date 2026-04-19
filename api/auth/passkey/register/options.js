const { generateRegistrationOptions } = require('@simplewebauthn/server');
const { connectToDatabase } = require('../../../../src/db/mongo');
const { withErrorHandling } = require('../../../../src/helpers/handler');
const {
  getPasskeyConfig,
  isPasskeyEnabled,
  validatePasskeyConfig
} = require('../../../../src/helpers/passkeys');
const { parseJsonBody } = require('../../../../src/helpers/users');
const { requireAuth } = require('../../../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../../../src/helpers/response');
const { PasskeyChallenge } = require('../../../../src/models/PasskeyChallenge');
const { User } = require('../../../../src/models/User');
const { UserPasskey } = require('../../../../src/models/UserPasskey');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  if (!isPasskeyEnabled()) {
    return sendError(res, 404, 'PASSKEY_DISABLED', 'Passkey authentication is disabled.');
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const config = getPasskeyConfig();
  const configErrors = validatePasskeyConfig(config);
  if (configErrors.length > 0) {
    return sendError(
      res,
      500,
      'PASSKEY_CONFIG_ERROR',
      'Passkey configuration is missing or invalid.',
      configErrors
    );
  }

  await connectToDatabase();

  const user = await User.findById(req.auth.userId).exec();
  if (!user || user.isActive !== true) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'Active user not found.');
  }

  const existingPasskeys = await UserPasskey.find({ userId: user._id })
    .select('credentialId transports')
    .exec();

  const options = await generateRegistrationOptions({
    rpID: config.rpID,
    rpName: config.rpName,
    userID: Buffer.from(String(user._id), 'utf8'),
    userName: user.email,
    userDisplayName: `${user.name} ${user.surname}`.trim() || user.email,
    timeout: 60000,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'
    },
    excludeCredentials: existingPasskeys.map((item) => ({
      id: item.credentialId,
      transports: Array.isArray(item.transports) ? item.transports : undefined
    }))
  });

  const now = Date.now();
  await PasskeyChallenge.create({
    action: 'register',
    challenge: options.challenge,
    userId: user._id,
    expiresAt: new Date(now + config.challengeTtlSec * 1000)
  });

  return sendSuccess(res, options);
}

module.exports = withErrorHandling(requireAuth(handler));

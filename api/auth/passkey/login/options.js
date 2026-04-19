const { generateAuthenticationOptions } = require('@simplewebauthn/server');
const { connectToDatabase } = require('../../../../src/db/mongo');
const { withErrorHandling } = require('../../../../src/helpers/handler');
const {
  getPasskeyConfig,
  getRequestIp,
  isPasskeyEnabled,
  validatePasskeyConfig
} = require('../../../../src/helpers/passkeys');
const { enforceRateLimit } = require('../../../../src/helpers/rateLimit');
const { parseJsonBody } = require('../../../../src/helpers/users');
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

  const ip = getRequestIp(req);
  const rateLimit = enforceRateLimit({
    scope: 'passkey-login-options',
    key: ip,
    limit: 15,
    windowMs: 60 * 1000
  });

  if (!rateLimit.allowed) {
    return sendError(
      res,
      429,
      'RATE_LIMITED',
      'Too many passkey login requests. Please try again shortly.',
      { retryAfterSec: rateLimit.retryAfterSec }
    );
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

  let hintedUserId = null;
  let allowCredentials = [];

  const requestedEmail =
    typeof payload.email === 'string' && payload.email.trim()
      ? payload.email.trim().toLowerCase()
      : null;

  if (requestedEmail) {
    const user = await User.findOne({ email: requestedEmail, isActive: true }).select('_id').exec();
    if (user) {
      hintedUserId = user._id;
      const passkeys = await UserPasskey.find({ userId: user._id })
        .select('credentialId transports')
        .exec();
      allowCredentials = passkeys.map((item) => ({
        id: item.credentialId,
        transports: Array.isArray(item.transports) ? item.transports : undefined
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    timeout: 60000,
    allowCredentials,
    userVerification: 'preferred'
  });

  await PasskeyChallenge.create({
    action: 'login',
    challenge: options.challenge,
    userId: hintedUserId,
    metadata: {
      allowCredentialIds: allowCredentials.map((item) => item.id)
    },
    expiresAt: new Date(Date.now() + config.challengeTtlSec * 1000)
  });

  return sendSuccess(res, options);
}

module.exports = withErrorHandling(handler);

const jwt = require('jsonwebtoken');
const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { config } = require('../../../../src/config/env');
const { connectToDatabase } = require('../../../../src/db/mongo');
const { withErrorHandling } = require('../../../../src/helpers/handler');
const {
  auditPasskeyEvent,
  getCredentialChallenge,
  getCredentialId,
  isPasskeyEnabled,
  getPasskeyConfig,
  getRequestIp,
  validatePasskeyConfig
} = require('../../../../src/helpers/passkeys');
const { enforceRateLimit } = require('../../../../src/helpers/rateLimit');
const { parseJsonBody, toUserResponse } = require('../../../../src/helpers/users');
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

  if (!payload.credential || typeof payload.credential !== 'object') {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'credential is required and must be a PublicKeyCredential JSON object.'
    );
  }

  const ip = getRequestIp(req);
  const rateLimit = enforceRateLimit({
    scope: 'passkey-login-verify',
    key: ip,
    limit: 30,
    windowMs: 5 * 60 * 1000
  });

  if (!rateLimit.allowed) {
    return sendError(
      res,
      429,
      'RATE_LIMITED',
      'Too many passkey login attempts. Please try again shortly.',
      { retryAfterSec: rateLimit.retryAfterSec }
    );
  }

  const configPasskey = getPasskeyConfig();
  const configErrors = validatePasskeyConfig(configPasskey);
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

  const challenge = getCredentialChallenge(payload.credential);
  if (!challenge) {
    return sendError(res, 400, 'INVALID_CREDENTIAL', 'Unable to parse credential challenge.');
  }

  const now = new Date();
  const challengeDoc = await PasskeyChallenge.findOneAndDelete({
    action: 'login',
    challenge,
    expiresAt: { $gt: now }
  }).exec();

  if (!challengeDoc) {
    auditPasskeyEvent('login_failed_challenge', { ip });
    return sendError(
      res,
      400,
      'PASSKEY_CHALLENGE_INVALID',
      'Challenge is missing, expired, or already used.'
    );
  }

  const credentialId = getCredentialId(payload.credential);
  if (!credentialId) {
    return sendError(res, 400, 'INVALID_CREDENTIAL', 'Unable to parse credential id.');
  }

  const passkey = await UserPasskey.findOne({ credentialId }).exec();
  if (!passkey) {
    auditPasskeyEvent('login_failed_missing_passkey', { ip, credentialId });
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Passkey not recognized.');
  }

  if (challengeDoc.userId && String(challengeDoc.userId) !== String(passkey.userId)) {
    auditPasskeyEvent('login_failed_hint_mismatch', {
      ip,
      challengeUserId: String(challengeDoc.userId),
      passkeyUserId: String(passkey.userId)
    });
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Passkey user mismatch.');
  }

  const allowedCredentialIds = Array.isArray(challengeDoc.metadata?.allowCredentialIds)
    ? challengeDoc.metadata.allowCredentialIds
    : [];
  if (allowedCredentialIds.length > 0 && !allowedCredentialIds.includes(credentialId)) {
    auditPasskeyEvent('login_failed_not_allowed', { ip, credentialId });
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Credential is not allowed for this login.');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: payload.credential,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: configPasskey.origins,
      expectedRPID: configPasskey.rpID,
      requireUserVerification: true,
      authenticator: {
        credentialID: passkey.credentialId,
        credentialPublicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: Array.isArray(passkey.transports) ? passkey.transports : []
      }
    });
  } catch (error) {
    auditPasskeyEvent('login_failed_verify', {
      ip,
      userId: String(passkey.userId),
      message: error?.message || 'verifyAuthenticationResponse failed'
    });
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Passkey verification failed.');
  }

  if (!verification.verified) {
    auditPasskeyEvent('login_failed_unverified', {
      ip,
      userId: String(passkey.userId)
    });
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Passkey verification failed.');
  }

  const user = await User.findById(passkey.userId).exec();
  if (!user || user.isActive !== true) {
    auditPasskeyEvent('login_failed_user_missing', {
      ip,
      userId: String(passkey.userId)
    });
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'User not found or inactive.');
  }

  const newCounter = Number(verification.authenticationInfo?.newCounter);
  passkey.counter = Number.isNaN(newCounter) ? passkey.counter : newCounter;
  passkey.lastUsedAt = new Date();
  await passkey.save();

  const token = jwt.sign(
    {
      userId: String(user._id),
      sub: String(user._id),
      role: user.role
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  auditPasskeyEvent('login_success', {
    ip,
    userId: String(user._id),
    credentialId
  });

  return sendSuccess(res, {
    token,
    user: toUserResponse(user)
  });
}

module.exports = withErrorHandling(handler);

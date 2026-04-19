const { verifyRegistrationResponse } = require('@simplewebauthn/server');
const { connectToDatabase } = require('../../../../src/db/mongo');
const { withErrorHandling } = require('../../../../src/helpers/handler');
const {
  auditPasskeyEvent,
  getCredentialChallenge,
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

  if (!payload.credential || typeof payload.credential !== 'object') {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'credential is required and must be a PublicKeyCredential JSON object.'
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

  const user = await User.findById(req.auth.userId).exec();
  if (!user || user.isActive !== true) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'Active user not found.');
  }

  const challenge = getCredentialChallenge(payload.credential);
  if (!challenge) {
    return sendError(res, 400, 'INVALID_CREDENTIAL', 'Unable to parse credential challenge.');
  }

  const now = new Date();
  const challengeDoc = await PasskeyChallenge.findOneAndDelete({
    action: 'register',
    challenge,
    userId: user._id,
    expiresAt: { $gt: now }
  }).exec();

  if (!challengeDoc) {
    auditPasskeyEvent('register_failed_challenge', {
      userId: String(user._id)
    });
    return sendError(
      res,
      400,
      'PASSKEY_CHALLENGE_INVALID',
      'Challenge is missing, expired, or already used.'
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: payload.credential,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpID,
      requireUserVerification: true
    });
  } catch (error) {
    const reason = error?.message || 'verifyRegistrationResponse failed';
    auditPasskeyEvent('register_failed_verify', {
      userId: String(user._id),
      message: reason
    });
    return sendError(
      res,
      400,
      'PASSKEY_REGISTER_FAILED',
      'Passkey registration verification failed.',
      { reason }
    );
  }

  if (!verification.verified || !verification.registrationInfo?.credentialID) {
    const reason = !verification.verified
      ? 'WebAuthn verification returned verified=false.'
      : 'registrationInfo.credentialID is missing.';
    auditPasskeyEvent('register_failed_unverified', {
      userId: String(user._id),
      reason
    });
    return sendError(
      res,
      400,
      'PASSKEY_REGISTER_FAILED',
      'Passkey registration could not be verified.',
      { reason }
    );
  }

  const registrationInfo = verification.registrationInfo;
  const credentialId = registrationInfo.credentialID;

  const existing = await UserPasskey.findOne({ credentialId }).select('_id userId').exec();
  if (existing && String(existing.userId) !== String(user._id)) {
    auditPasskeyEvent('register_failed_duplicate', {
      userId: String(user._id),
      credentialId
    });
    return sendError(
      res,
      409,
      'PASSKEY_EXISTS',
      'This passkey is already registered to another account.'
    );
  }

  const transports = Array.isArray(payload.credential.response?.transports)
    ? payload.credential.response.transports
    : [];

  await UserPasskey.findOneAndUpdate(
    { credentialId },
    {
      userId: user._id,
      credentialId,
      publicKey: Buffer.from(registrationInfo.credentialPublicKey),
      counter: Number(registrationInfo.counter || 0),
      transports,
      deviceType: registrationInfo.credentialDeviceType || null,
      backedUp:
        typeof registrationInfo.credentialBackedUp === 'boolean'
          ? registrationInfo.credentialBackedUp
          : null
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();

  auditPasskeyEvent('register_success', {
    userId: String(user._id),
    credentialId
  });

  return sendSuccess(res, { ok: true });
}

module.exports = withErrorHandling(requireAuth(handler));

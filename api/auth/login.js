const jwt = require('jsonwebtoken');
const { config } = require('../../src/config/env');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { buildPassCodeLookup, comparePassCode } = require('../../src/helpers/passcode');
const { parseJsonBody, toUserResponse } = require('../../src/helpers/users');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { User } = require('../../src/models/User');
const { validateLoginPayload } = require('../../src/validation/userValidation');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateLoginPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid login payload.', details);
  }

  await connectToDatabase();
  const passCodeLookup = buildPassCodeLookup(payload.passCode);

  const user = await User.findOne({
    passCodeLookup,
    isActive: true
  })
    .select('+passCodeHash')
    .exec();

  if (!user) {
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid passCode.');
  }

  const isPassCodeValid = await comparePassCode(payload.passCode, user.passCodeHash);
  if (!isPassCodeValid) {
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid passCode.');
  }

  const token = jwt.sign(
    {
      userId: String(user._id),
      sub: String(user._id),
      role: user.role
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return sendSuccess(res, {
    token,
    user: toUserResponse(user)
  });
}

module.exports = withErrorHandling(handler);

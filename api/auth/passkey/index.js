const { connectToDatabase } = require('../../../src/db/mongo');
const { withErrorHandling } = require('../../../src/helpers/handler');
const {
  auditPasskeyEvent,
  ensureObjectId,
  isPasskeyEnabled,
  toPasskeyListItem
} = require('../../../src/helpers/passkeys');
const { requireAuth } = require('../../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../../src/helpers/response');
const { User } = require('../../../src/models/User');
const { UserPasskey } = require('../../../src/models/UserPasskey');

async function handler(req, res) {
  if (!['GET', 'DELETE'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'DELETE']);
  }

  if (!isPasskeyEnabled()) {
    return sendError(res, 404, 'PASSKEY_DISABLED', 'Passkey authentication is disabled.');
  }

  await connectToDatabase();

  const user = await User.findById(req.auth.userId).select('_id isActive').exec();
  if (!user || user.isActive !== true) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'Active user not found.');
  }

  if (req.method === 'GET') {
    const passkeys = await UserPasskey.find({ userId: user._id }).sort({ createdAt: -1 }).exec();
    return sendSuccess(res, {
      items: passkeys.map(toPasskeyListItem)
    });
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!ensureObjectId(id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid passkey id.');
  }

  const deleted = await UserPasskey.findOneAndDelete({
    _id: id,
    userId: user._id
  }).exec();

  if (!deleted) {
    return sendError(res, 404, 'PASSKEY_NOT_FOUND', 'Passkey not found.');
  }

  auditPasskeyEvent('delete_success', {
    userId: String(user._id),
    passkeyId: id
  });

  return sendSuccess(res, {
    id,
    deleted: true
  });
}

module.exports = withErrorHandling(requireAuth(handler));

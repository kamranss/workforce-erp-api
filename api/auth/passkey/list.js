const { connectToDatabase } = require('../../../src/db/mongo');
const { withErrorHandling } = require('../../../src/helpers/handler');
const { isPasskeyEnabled, toPasskeyListItem } = require('../../../src/helpers/passkeys');
const { requireAuth } = require('../../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../../src/helpers/response');
const { User } = require('../../../src/models/User');
const { UserPasskey } = require('../../../src/models/UserPasskey');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isPasskeyEnabled()) {
    return sendError(res, 404, 'PASSKEY_DISABLED', 'Passkey authentication is disabled.');
  }

  await connectToDatabase();

  const user = await User.findById(req.auth.userId).select('_id isActive').exec();
  if (!user || user.isActive !== true) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'Active user not found.');
  }

  const passkeys = await UserPasskey.find({ userId: user._id }).sort({ createdAt: -1 }).exec();

  return sendSuccess(res, {
    items: passkeys.map(toPasskeyListItem)
  });
}

module.exports = withErrorHandling(requireAuth(handler));

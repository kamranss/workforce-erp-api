const { requireAuth } = require('../../src/middleware/auth');
const { withErrorHandling } = require('../../src/helpers/handler');
const { connectToDatabase } = require('../../src/db/mongo');
const { toUserResponse } = require('../../src/helpers/users');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { User } = require('../../src/models/User');

async function meHandler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  await connectToDatabase();
  const user = await User.findById(req.auth.userId).exec();

  if (!user) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
  }

  return sendSuccess(res, toUserResponse(user));
}

module.exports = withErrorHandling(requireAuth(meHandler));

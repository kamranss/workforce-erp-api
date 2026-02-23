const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { ROLE_USER } = require('../../src/helpers/roles');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { TimeEntry } = require('../../src/models/TimeEntry');

function toOpenEntryResponse(entry) {
  return {
    id: String(entry._id),
    projectIdIn: String(entry.projectIdIn || entry.projectId),
    projectIdOut: entry.projectIdOut ? String(entry.projectIdOut) : null,
    clockInAt: entry.clockInAt,
    breakMinutes: entry.breakMinutes,
    minutesWorked: entry.minutesWorked,
    notes: entry.notes
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (req.auth.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Only user role can access this endpoint.');
  }

  await connectToDatabase();
  const entry = await TimeEntry.findOne({
    userId: req.auth.userId,
    clockOutAt: null,
    isDeleted: { $ne: true }
  }).exec();

  return sendSuccess(res, {
    hasOpen: Boolean(entry),
    entry: entry ? toOpenEntryResponse(entry) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

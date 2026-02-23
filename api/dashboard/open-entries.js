const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { TimeEntry } = require('../../src/models/TimeEntry');

function toOpenEntryMonitorResponse(entry) {
  return {
    id: String(entry._id),
    userId: String(entry.userId),
    projectIdIn: String(entry.projectIdIn || entry.projectId),
    clockInAt: entry.clockInAt,
    geoIn: entry.geoIn
      ? {
          lat: entry.geoIn.lat,
          lng: entry.geoIn.lng
        }
      : null,
    addrIn: entry.addrIn,
    notes: entry.notes
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access dashboard endpoints.');
  }

  await connectToDatabase();

  const limit = parseLimit(req.query.limit, 20, 100);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  const query = {
    isDeleted: { $ne: true },
    clockOutAt: null
  };

  if (req.query.projectIdIn !== undefined) {
    if (!isValidObjectId(req.query.projectIdIn)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'projectIdIn must be a valid ObjectId.');
    }

    query.$or = [{ projectIdIn: req.query.projectIdIn }, { projectId: req.query.projectIdIn }];
  }

  if (cursor) {
    const cursorCondition = {
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ]
    };
    query.$and = [...(query.$and || []), cursorCondition];
  }

  const items = await TimeEntry.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .exec();

  const hasNextPage = items.length > limit;
  const pageItems = hasNextPage ? items.slice(0, limit) : items;

  return sendSuccess(res, {
    items: pageItems.map(toOpenEntryMonitorResponse),
    nextCursor: hasNextPage ? encodeCursor(items[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

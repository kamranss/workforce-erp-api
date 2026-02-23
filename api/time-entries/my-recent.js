const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { ROLE_USER } = require('../../src/helpers/roles');
const { parseRangeWithDefaultDays } = require('../../src/helpers/dates');
const { toTimeEntryResponse } = require('../../src/helpers/timeEntries');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { TimeEntry } = require('../../src/models/TimeEntry');

function toUserHoursResponse(entry) {
  const row = toTimeEntryResponse(entry);
  delete row.geoIn;
  delete row.geoOut;
  return row;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (req.auth.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Only user role can access this endpoint.');
  }

  const range = parseRangeWithDefaultDays(req.query, 14);
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }

  const limit = parseLimit(req.query.limit, 20, 100);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  await connectToDatabase();

  const query = {
    userId: req.auth.userId,
    isDeleted: { $ne: true },
    clockOutAt: { $ne: null },
    clockInAt: {
      $gte: range.from,
      $lte: range.to
    }
  };

  if (cursor) {
    const cursorCondition = {
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ]
    };
    query.$and = [...(query.$and || []), cursorCondition];
  }

  const docs = await TimeEntry.find(query)
    .populate('projectIdIn', 'description locationKey address')
    .populate('projectIdOut', 'description locationKey address')
    .populate('projectId', 'description locationKey address')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .exec();

  const hasNextPage = docs.length > limit;
  const pageItems = hasNextPage ? docs.slice(0, limit) : docs;

  return sendSuccess(res, {
    range: {
      from: range.from,
      to: range.to
    },
    items: pageItems.map(toUserHoursResponse),
    nextCursor: hasNextPage ? encodeCursor(docs[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { parseHoursRange } = require('../../src/helpers/dates');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId, toTimeEntryResponse } = require('../../src/helpers/timeEntries');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { TimeEntry } = require('../../src/models/TimeEntry');
require('../../src/models/Project');
require('../../src/models/User');

function mapHoursItem(entry) {
  const row = toTimeEntryResponse(entry);
  delete row.geoIn;
  delete row.geoOut;
  return row;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  const range = parseHoursRange(req.query, 'America/Chicago');
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }

  const limit = parseLimit(req.query.limit, 30, 100);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  const adminOrSuperAdmin = isAdminOrSuperAdmin(req.auth.role);
  const baseQuery = {
    isDeleted: { $ne: true },
    clockOutAt: { $ne: null },
    clockInAt: {
      $gte: range.from,
      $lte: range.to
    }
  };

  if (adminOrSuperAdmin) {
    if (req.query.userId !== undefined) {
      if (!isValidObjectId(req.query.userId)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'userId must be a valid ObjectId.');
      }
      baseQuery.userId = req.query.userId;
    }
  } else if (req.query.userId !== undefined && req.query.userId !== req.auth.userId) {
    return sendError(res, 403, 'FORBIDDEN', 'Users can only access their own hours.');
  } else {
    baseQuery.userId = req.auth.userId;
  }

  const pagedQuery = { ...baseQuery };
  if (cursor) {
    const cursorCondition = {
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ]
    };
    pagedQuery.$and = [...(pagedQuery.$and || []), cursorCondition];
  }

  await connectToDatabase();

  const [docs, totalsAgg] = await Promise.all([
    TimeEntry.find(pagedQuery)
      .populate('projectIdIn', 'description locationKey address')
      .populate('projectIdOut', 'description locationKey address')
      .populate('projectId', 'description locationKey address')
      .populate('userId', 'name surname email role')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec(),
    TimeEntry.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalMinutes: { $sum: { $ifNull: ['$minutesWorked', 0] } },
          totalEarned: {
            $sum: {
              $multiply: [
                { $divide: [{ $ifNull: ['$minutesWorked', 0] }, 60] },
                { $ifNull: ['$hourlyRateAtTime', 0] }
              ]
            }
          },
          totalEntries: { $sum: 1 }
        }
      }
    ])
  ]);

  const hasNextPage = docs.length > limit;
  const pageItems = hasNextPage ? docs.slice(0, limit) : docs;
  const totals = totalsAgg[0] || { totalMinutes: 0, totalEarned: 0, totalEntries: 0 };

  return sendSuccess(res, {
    range: {
      preset: range.preset,
      label: range.label,
      from: range.from,
      to: range.to
    },
    filters: {
      userId: baseQuery.userId ? String(baseQuery.userId) : undefined
    },
    summary: {
      totalEntries: Number(totals.totalEntries || 0),
      totalMinutes: Number(totals.totalMinutes || 0),
      totalHours: Number(((Number(totals.totalMinutes || 0)) / 60).toFixed(2)),
      totalEarned: Number((Number(totals.totalEarned || 0)).toFixed(2))
    },
    items: pageItems.map(mapHoursItem),
    nextCursor: hasNextPage ? encodeCursor(docs[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

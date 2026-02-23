const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { parseLimit, encodeCursor, decodeCursor } = require('../../src/helpers/users');
const { isValidObjectId, parseBooleanQuery, toTimeEntryResponse } = require('../../src/helpers/timeEntries');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
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

  await connectToDatabase();

  const limit = parseLimit(req.query.limit, 20, 100);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  const query = {};
  const adminOrSuperAdmin = isAdminOrSuperAdmin(req.auth.role);
  const includeDeleted = req.query.includeDeleted === 'true';

  if (includeDeleted && !adminOrSuperAdmin) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can include deleted entries.');
  }

  if (!includeDeleted) {
    query.isDeleted = { $ne: true };
  }

  if (!adminOrSuperAdmin) {
    query.userId = req.auth.userId;
  } else {
    if (req.query.userId !== undefined) {
      if (!isValidObjectId(req.query.userId)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'userId must be a valid ObjectId.');
      }
      query.userId = req.query.userId;
    }
  }

  if (req.query.projectIdIn !== undefined) {
    if (!isValidObjectId(req.query.projectIdIn)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'projectIdIn must be a valid ObjectId.');
    }
    query.$or = [
      { projectIdIn: req.query.projectIdIn },
      { projectId: req.query.projectIdIn }
    ];
  }

  if (req.query.projectIdOut !== undefined) {
    if (!isValidObjectId(req.query.projectIdOut)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'projectIdOut must be a valid ObjectId.');
    }
    query.projectIdOut = req.query.projectIdOut;
  }

  if (req.query.from !== undefined || req.query.to !== undefined) {
    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to) : null;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'from must be a valid ISO date.');
    }

    if (toDate && Number.isNaN(toDate.getTime())) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'to must be a valid ISO date.');
    }

    query.clockInAt = {};
    if (fromDate) {
      query.clockInAt.$gte = fromDate;
    }
    if (toDate) {
      query.clockInAt.$lte = toDate;
    }
  }

  if (req.query.isOpen !== undefined) {
    const isOpenParsed = parseBooleanQuery(req.query.isOpen);
    if (!isOpenParsed.isValid) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'isOpen must be true or false when provided.');
    }

    query.clockOutAt = isOpenParsed.value ? null : { $ne: null };
  }

  if (cursor) {
    const cursorCondition = {
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          _id: { $lt: new mongoose.Types.ObjectId(cursor.id) }
        }
      ]
    };

    if (Object.keys(query).length === 0) {
      Object.assign(query, cursorCondition);
    } else {
      query.$and = [...(query.$and || []), cursorCondition];
    }
  }

  const items = await TimeEntry.find(query)
    .populate('projectIdIn', 'description locationKey address')
    .populate('projectIdOut', 'description locationKey address')
    .populate('projectId', 'description locationKey address')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .exec();

  const hasNextPage = items.length > limit;
  const pageItems = hasNextPage ? items.slice(0, limit) : items;

  return sendSuccess(res, {
    items: adminOrSuperAdmin
      ? pageItems.map(toTimeEntryResponse)
      : pageItems.map(toUserHoursResponse),
    nextCursor: hasNextPage ? encodeCursor(items[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

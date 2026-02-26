const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { toProjectResponse } = require('../../src/helpers/projects');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { Project, PROJECT_STATUSES } = require('../../src/models/Project');

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  await connectToDatabase();

  const limit = parseLimit(req.query.limit, 10, 100);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  const query = {
    isActive: true
  };

  if (req.query.status !== undefined) {
    if (!PROJECT_STATUSES.includes(req.query.status)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'status must be one of: waiting, ongoing, finished, canceled.');
    }
    query.status = req.query.status;
  }

  if (req.query.locationKey !== undefined) {
    const locationKey = String(req.query.locationKey).trim();
    if (!locationKey) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'locationKey must be a non-empty string when provided.');
    }
    query.locationKey = locationKey;
  }

  if (req.query.customerId !== undefined) {
    if (!isValidObjectId(req.query.customerId)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'customerId must be a valid ObjectId when provided.');
    }
    query.customerId = req.query.customerId;
  }

  if (req.query.q !== undefined) {
    const q = String(req.query.q).trim();
    if (q) {
      const regex = new RegExp(escapeForRegex(q), 'i');

      const customerDocs = await Customer.find({
        isDeleted: { $ne: true },
        $or: [{ fullName: regex }, { address: regex }, { email: regex }, { phone: regex }]
      })
        .select('_id')
        .limit(500)
        .lean()
        .exec();

      const customerIds = customerDocs.map((doc) => doc._id);
      const orConditions = [
        { description: regex },
        { materials: regex },
        { 'address.raw': regex },
        { 'address.normalized': regex },
        { quoteNumber: regex }
      ];

      if (customerIds.length > 0) {
        orConditions.push({ customerId: { $in: customerIds } });
      }

      query.$and = [...(query.$and || []), { $or: orConditions }];
    }
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

  const docs = await Project.find(query)
    .populate('customerId', 'fullName address email phone')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .exec();

  const hasNextPage = docs.length > limit;
  const pageItems = hasNextPage ? docs.slice(0, limit) : docs;

  return sendSuccess(res, {
    items: pageItems.map(toProjectResponse),
    nextCursor: hasNextPage ? encodeCursor(docs[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

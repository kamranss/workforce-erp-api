const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { toPaymentResponse } = require('../../src/helpers/payments');
const { ROLE_USER, isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { decodeCursor, encodeCursor, parseJsonBody, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Payment } = require('../../src/models/Payment');
const { User } = require('../../src/models/User');
const { validateCreatePaymentPayload } = require('../../src/validation/paymentValidation');

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'POST']);
  }

  const adminOrSuperAdmin = isAdminOrSuperAdmin(req.auth.role);
  if (req.method === 'POST' && !adminOrSuperAdmin) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can create payments.');
  }

  if (req.method === 'GET' && !adminOrSuperAdmin && req.auth.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Only user, admin, or superAdmin can access this endpoint.');
  }

  await connectToDatabase();

  if (req.method === 'GET') {
    const limit = parseLimit(req.query.limit, 5, 100);
    const cursor = decodeCursor(req.query.cursor);
    if (req.query.cursor && !cursor) {
      return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
    }

    const includeDeleted = adminOrSuperAdmin && req.query.includeDeleted === 'true';
    const query = includeDeleted ? {} : { isDeleted: { $ne: true } };

    if (adminOrSuperAdmin) {
      if (req.query.userId !== undefined) {
        if (!isValidObjectId(req.query.userId)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'userId must be a valid ObjectId.');
        }
        query.userId = req.query.userId;
      }
    } else {
      query.userId = req.auth.userId;
      if (req.query.userId !== undefined && req.query.userId !== req.auth.userId) {
        return sendError(res, 403, 'FORBIDDEN', 'Users can only access their own payments.');
      }
    }

    if (req.query.method !== undefined) {
      query.method = req.query.method;
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

      query.paidAt = {};
      if (fromDate) {
        query.paidAt.$gte = fromDate;
      }
      if (toDate) {
        query.paidAt.$lte = toDate;
      }
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

    const items = await Payment.find(query)
      .populate('userId', 'name surname')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasNextPage = items.length > limit;
    const pageItems = hasNextPage ? items.slice(0, limit) : items;

    return sendSuccess(res, {
      items: pageItems.map(toPaymentResponse),
      nextCursor: hasNextPage ? encodeCursor(items[limit - 1]) : null
    });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateCreatePaymentPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid payment payload.', details);
  }

  const user = await User.findById(payload.userId).select('_id').exec();
  if (!user) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
  }

  const payment = await Payment.create({
    userId: payload.userId,
    amount: payload.amount,
    paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
    method: payload.method,
    notes: payload.notes,
    createdBy: req.auth.userId
  });

  return sendSuccess(res, toPaymentResponse(payment), 201);
}

module.exports = withErrorHandling(requireAuth(handler));

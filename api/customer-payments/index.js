const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { toCustomerPaymentResponse } = require('../../src/helpers/customerPayments');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { decodeCursor, encodeCursor, parseJsonBody, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { CustomerPayment, CUSTOMER_PAYMENT_TYPES } = require('../../src/models/CustomerPayment');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');
const {
  validateCreateCustomerPaymentPayload
} = require('../../src/validation/customerPaymentValidation');

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'POST']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(
      res,
      403,
      'FORBIDDEN',
      'Only admin or superAdmin can access this endpoint.'
    );
  }

  await connectToDatabase();

  if (req.method === 'GET') {
    const limit = parseLimit(req.query.limit, 10, 100);
    const cursor = decodeCursor(req.query.cursor);
    if (req.query.cursor && !cursor) {
      return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
    }

    const includeDeleted = req.query.includeDeleted === 'true';
    const query = includeDeleted ? {} : { isDeleted: { $ne: true } };

    if (req.query.projectId !== undefined) {
      if (!isValidObjectId(req.query.projectId)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'projectId must be a valid ObjectId.');
      }
      query.projectId = req.query.projectId;
    }

    if (req.query.customerId !== undefined) {
      if (!isValidObjectId(req.query.customerId)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'customerId must be a valid ObjectId.');
      }
      query.customerId = req.query.customerId;
    }

    if (req.query.type !== undefined) {
      if (!CUSTOMER_PAYMENT_TYPES.includes(req.query.type)) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'type must be one of: main_work, material, other, unknown.'
        );
      }
      query.type = req.query.type;
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

    const items = await CustomerPayment.find(query)
      .populate('projectId', 'description address')
      .populate('customerId', 'fullName address email phone')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasNextPage = items.length > limit;
    const pageItems = hasNextPage ? items.slice(0, limit) : items;

    return sendSuccess(res, {
      items: pageItems.map(toCustomerPaymentResponse),
      nextCursor: hasNextPage ? encodeCursor(items[limit - 1]) : null
    });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateCreateCustomerPaymentPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid customer payment payload.', details);
  }

  const project = await Project.findById(payload.projectId).select('_id description customerId').exec();
  if (!project) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }

  const payment = await CustomerPayment.create({
    projectId: project._id,
    customerId: project.customerId || null,
    amount: payload.amount,
    type: payload.type || 'main_work',
    paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
    notes: payload.notes,
    createdBy: req.auth.userId
  });

  const createdPayment = await CustomerPayment.findById(payment._id)
    .populate('projectId', 'description address')
    .populate('customerId', 'fullName address email phone')
    .exec();
  return sendSuccess(res, toCustomerPaymentResponse(createdPayment), 201);
}

module.exports = withErrorHandling(requireAuth(handler));

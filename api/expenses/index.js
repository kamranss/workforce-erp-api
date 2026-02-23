const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { toExpenseResponse } = require('../../src/helpers/expenses');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { decodeCursor, encodeCursor, parseJsonBody, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Expense, EXPENSE_SCOPES } = require('../../src/models/Expense');
const { Project } = require('../../src/models/Project');
const { validateCreateExpensePayload } = require('../../src/validation/expenseValidation');

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'POST']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  await connectToDatabase();

  if (req.method === 'GET') {
    const limit = parseLimit(req.query.limit, 5, 100);
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

    if (req.query.type !== undefined) {
      query.type = req.query.type;
    }
    if (req.query.scope !== undefined) {
      if (!EXPENSE_SCOPES.includes(req.query.scope)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'scope must be one of: project, company.');
      }
      query.scope = req.query.scope;
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

      query.spentAt = {};
      if (fromDate) {
        query.spentAt.$gte = fromDate;
      }
      if (toDate) {
        query.spentAt.$lte = toDate;
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

    const items = await Expense.find(query)
      .populate('projectId', 'description status')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasNextPage = items.length > limit;
    const pageItems = hasNextPage ? items.slice(0, limit) : items;

    return sendSuccess(res, {
      items: pageItems.map(toExpenseResponse),
      nextCursor: hasNextPage ? encodeCursor(items[limit - 1]) : null
    });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateCreateExpensePayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid expense payload.', details);
  }

  const scope = payload.scope || 'project';

  let projectId = null;
  if (scope === 'project') {
    const project = await Project.findById(payload.projectId).select('_id').exec();
    if (!project) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    projectId = payload.projectId;
  } else if (payload.projectId) {
    const project = await Project.findById(payload.projectId).select('_id').exec();
    if (!project) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    projectId = payload.projectId;
  }

  const expense = await Expense.create({
    scope,
    projectId,
    type: payload.type,
    amount: payload.amount,
    spentAt: payload.spentAt ? new Date(payload.spentAt) : new Date(),
    notes: payload.notes,
    createdBy: req.auth.userId
  });

  const createdExpense = await Expense.findById(expense._id).populate('projectId', 'description status').exec();
  return sendSuccess(res, toExpenseResponse(createdExpense), 201);
}

module.exports = withErrorHandling(requireAuth(handler));

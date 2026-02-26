const { connectToDatabase } = require('../../src/db/mongo');
const { toExpenseResponse } = require('../../src/helpers/expenses');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin, isSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Expense, EXPENSE_SCOPES, EXPENSE_TYPES } = require('../../src/models/Expense');
const { Project } = require('../../src/models/Project');
const { validatePatchExpensePayload } = require('../../src/validation/expenseValidation');

function getRequestedId(req) {
  return typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
}

async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  const id = getRequestedId(req);
  if (!id) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id query parameter is required.');
  }
  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid ObjectId.');
  }

  await connectToDatabase();
  const expense = await Expense.findById(id).populate('projectId', 'description status address').exec();
  if (!expense) {
    return sendError(res, 404, 'EXPENSE_NOT_FOUND', 'Expense not found.');
  }

  const includeDeleted = req.query.includeDeleted === 'true';
  if (expense.isDeleted === true && !includeDeleted) {
    return sendError(res, 404, 'EXPENSE_NOT_FOUND', 'Expense not found.');
  }

  if (req.method === 'GET') {
    return sendSuccess(res, toExpenseResponse(expense));
  }

  if (req.method === 'DELETE') {
    if (!isSuperAdmin(req.auth.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can delete expenses.');
    }

    expense.isDeleted = true;
    expense.deletedAt = new Date();
    expense.deletedBy = req.auth.userId;
    await expense.save();
    return sendSuccess(res, { id: String(expense._id), isDeleted: true });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validatePatchExpensePayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid expense update payload.', details);
  }

  if (payload.type !== undefined && !EXPENSE_TYPES.includes(payload.type)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'type must be one of: material, damage, unknown, other.');
  }
  if (payload.scope !== undefined && !EXPENSE_SCOPES.includes(payload.scope)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'scope must be one of: project, company.');
  }

  const nextScope = payload.scope !== undefined ? payload.scope : (expense.scope || 'project');
  const nextProjectId =
    payload.projectId !== undefined
      ? payload.projectId
      : expense.projectId
      ? String(expense.projectId._id || expense.projectId)
      : null;

  if (nextScope === 'project' && !nextProjectId) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'projectId is required when scope=project.');
  }

  if (nextProjectId) {
    const project = await Project.findById(nextProjectId).select('_id').exec();
    if (!project) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
  }

  if (payload.type !== undefined) {
    expense.type = payload.type;
  }
  if (payload.scope !== undefined) {
    expense.scope = payload.scope;
  }
  if (payload.projectId !== undefined) {
    expense.projectId = payload.projectId;
  }
  if (payload.amount !== undefined) {
    expense.amount = payload.amount;
  }
  if (payload.spentAt !== undefined) {
    expense.spentAt = new Date(payload.spentAt);
  }
  if (payload.notes !== undefined) {
    expense.notes = payload.notes;
  }

  await expense.save();
  const updatedExpense = await Expense.findById(expense._id)
    .populate('projectId', 'description status address')
    .exec();
  return sendSuccess(res, toExpenseResponse(updatedExpense));
}

module.exports = withErrorHandling(requireAuth(handler));

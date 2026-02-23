const { connectToDatabase } = require('../../src/db/mongo');
const { toBonusAndPenaltyResponse } = require('../../src/helpers/bonusAndPenalties');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin, isSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { BonusAndPenalty } = require('../../src/models/BonusAndPenalty');
const { validatePatchBonusAndPenaltyPayload } = require('../../src/validation/bonusAndPenaltyValidation');

function getRequestedId(req) {
  return typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
}

async function handler(req, res) {
  if (!['PATCH', 'DELETE'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['PATCH', 'DELETE']);
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
  const item = await BonusAndPenalty.findById(id).exec();
  if (!item) {
    return sendError(res, 404, 'BONUS_PENALTY_NOT_FOUND', 'Bonus/penalty record not found.');
  }

  if (req.method === 'DELETE') {
    if (!isSuperAdmin(req.auth.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can delete bonus/penalty records.');
    }

    item.isDeleted = true;
    item.deletedAt = new Date();
    item.deletedBy = req.auth.userId;
    await item.save();
    return sendSuccess(res, { id: String(item._id), isDeleted: true });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validatePatchBonusAndPenaltyPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid bonus/penalty update payload.', details);
  }

  if (payload.amount !== undefined) {
    item.amount = payload.amount;
  }

  if (payload.description !== undefined) {
    item.description = payload.description;
  }

  if (payload.effectiveAt !== undefined) {
    item.effectiveAt = new Date(payload.effectiveAt);
  }

  await item.save();
  return sendSuccess(res, toBonusAndPenaltyResponse(item));
}

module.exports = withErrorHandling(requireAuth(handler));

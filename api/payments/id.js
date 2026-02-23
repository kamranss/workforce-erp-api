const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { toPaymentResponse } = require('../../src/helpers/payments');
const { isAdminOrSuperAdmin, isSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Payment } = require('../../src/models/Payment');
const { validatePatchPaymentPayload } = require('../../src/validation/paymentValidation');

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
  const payment = await Payment.findById(id).exec();

  if (!payment) {
    return sendError(res, 404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  }

  const includeDeleted = req.query.includeDeleted === 'true';
  if (payment.isDeleted === true && !includeDeleted) {
    return sendError(res, 404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  }

  if (req.method === 'GET') {
    return sendSuccess(res, toPaymentResponse(payment));
  }

  if (req.method === 'DELETE') {
    if (!isSuperAdmin(req.auth.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can delete payments.');
    }

    payment.isDeleted = true;
    payment.deletedAt = new Date();
    payment.deletedBy = req.auth.userId;
    await payment.save();
    return sendSuccess(res, { id: String(payment._id), isDeleted: true });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validatePatchPaymentPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid payment update payload.', details);
  }

  if (payload.amount !== undefined) {
    payment.amount = payload.amount;
  }
  if (payload.paidAt !== undefined) {
    payment.paidAt = new Date(payload.paidAt);
  }
  if (payload.method !== undefined) {
    payment.method = payload.method;
  }
  if (payload.notes !== undefined) {
    payment.notes = payload.notes;
  }

  await payment.save();
  return sendSuccess(res, toPaymentResponse(payment));
}

module.exports = withErrorHandling(requireAuth(handler));

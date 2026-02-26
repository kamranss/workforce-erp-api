const { connectToDatabase } = require('../../src/db/mongo');
const { toCustomerPaymentResponse } = require('../../src/helpers/customerPayments');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { CustomerPayment } = require('../../src/models/CustomerPayment');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');
const {
  validatePatchCustomerPaymentPayload
} = require('../../src/validation/customerPaymentValidation');

function getRequestedId(req) {
  return typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
}

async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(
      res,
      403,
      'FORBIDDEN',
      'Only admin or superAdmin can access this endpoint.'
    );
  }

  const id = getRequestedId(req);
  if (!id) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id query parameter is required.');
  }

  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid ObjectId.');
  }

  await connectToDatabase();
  const payment = await CustomerPayment.findById(id)
    .populate('projectId', 'description address')
    .populate('customerId', 'fullName address email phone')
    .exec();
  if (!payment) {
    return sendError(res, 404, 'CUSTOMER_PAYMENT_NOT_FOUND', 'Customer payment not found.');
  }

  const includeDeleted = req.query.includeDeleted === 'true';
  if (payment.isDeleted === true && !includeDeleted) {
    return sendError(res, 404, 'CUSTOMER_PAYMENT_NOT_FOUND', 'Customer payment not found.');
  }

  if (req.method === 'GET') {
    return sendSuccess(res, toCustomerPaymentResponse(payment));
  }

  if (req.method === 'DELETE') {
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

  const details = validatePatchCustomerPaymentPayload(payload);
  if (details.length > 0) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Invalid customer payment update payload.',
      details
    );
  }

  if (payload.projectId !== undefined) {
    const project = await Project.findById(payload.projectId).select('_id customerId').exec();
    if (!project) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    payment.projectId = project._id;
    payment.customerId = project.customerId || null;
  }

  if (payload.amount !== undefined) {
    payment.amount = payload.amount;
  }
  if (payload.type !== undefined) {
    payment.type = payload.type;
  }
  if (payload.paidAt !== undefined) {
    payment.paidAt = new Date(payload.paidAt);
  }
  if (payload.notes !== undefined) {
    payment.notes = payload.notes;
  }

  await payment.save();
  const updatedPayment = await CustomerPayment.findById(payment._id)
    .populate('projectId', 'description address')
    .populate('customerId', 'fullName address email phone')
    .exec();
  return sendSuccess(res, toCustomerPaymentResponse(updatedPayment));
}

module.exports = withErrorHandling(requireAuth(handler));

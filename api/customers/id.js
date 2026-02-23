const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { toCustomerResponse } = require('../../src/helpers/customers');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin, isSuperAdmin } = require('../../src/helpers/roles');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { validatePatchCustomerPayload } = require('../../src/validation/customerValidation');

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
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid ObjectId.');
  }

  await connectToDatabase();
  const customer = await Customer.findById(id).exec();
  if (!customer) {
    return sendError(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
  }

  const includeDeleted = req.query.includeDeleted === 'true';
  if (customer.isDeleted === true && !includeDeleted) {
    return sendError(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
  }

  if (req.method === 'GET') {
    return sendSuccess(res, toCustomerResponse(customer));
  }

  if (req.method === 'DELETE') {
    if (!isSuperAdmin(req.auth.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can delete customers.');
    }
    customer.isDeleted = true;
    customer.deletedAt = new Date();
    customer.deletedBy = req.auth.userId;
    await customer.save();
    return sendSuccess(res, { id: String(customer._id), isDeleted: true });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validatePatchCustomerPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid customer update payload.', details);
  }

  if (payload.fullName !== undefined) {
    customer.fullName = payload.fullName.trim();
  }
  if (payload.address !== undefined) {
    customer.address = payload.address === null ? null : payload.address.trim();
  }
  if (payload.email !== undefined) {
    customer.email = payload.email === null ? null : payload.email.trim().toLowerCase();
  }
  if (payload.phone !== undefined) {
    customer.phone = payload.phone === null ? null : payload.phone.trim();
  }

  await customer.save();
  return sendSuccess(res, toCustomerResponse(customer));
}

module.exports = withErrorHandling(requireAuth(handler));

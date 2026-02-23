const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { buildPassCodeCredentials } = require('../../src/helpers/passcode');
const { ROLE_SUPER_ADMIN, ROLE_USER, isAdmin, isSuperAdmin, isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { parseJsonBody, toUserResponse } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { User, USER_ROLES } = require('../../src/models/User');
const { validatePatchUserPayload, normalizeEmail } = require('../../src/validation/userValidation');

function getRequestedId(req) {
  return typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
}

async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }

  const requestedId = getRequestedId(req);
  if (!requestedId) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id query parameter is required.');
  }

  if (!mongoose.Types.ObjectId.isValid(requestedId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid MongoDB ObjectId.');
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  const callerIsSuperAdmin = isSuperAdmin(req.auth.role);
  const callerIsAdmin = isAdmin(req.auth.role);

  await connectToDatabase();
  const user = await User.findById(requestedId).select('+passCodeHash +passCodeLookup').exec();

  if (!user) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
  }

  if (callerIsAdmin && user.role !== ROLE_USER) {
    return sendError(
      res,
      403,
      'FORBIDDEN',
      'Admins can access/update/delete only users with role=user.'
    );
  }

  if (!callerIsSuperAdmin && user.role === ROLE_SUPER_ADMIN) {
    return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can manage superAdmin records.');
  }

  if (req.method === 'GET') {
    return sendSuccess(res, toUserResponse(user));
  }

  if (req.method === 'DELETE') {
    if (callerIsAdmin && user.role !== ROLE_USER) {
      return sendError(res, 403, 'FORBIDDEN', 'Admins can delete only role=user.');
    }
    user.isActive = false;
    await user.save();
    return sendSuccess(res, toUserResponse(user));
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validatePatchUserPayload(payload, callerIsAdmin || callerIsSuperAdmin);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid update payload.', details);
  }

  if (callerIsAdmin && payload.role !== undefined) {
    return sendError(res, 403, 'FORBIDDEN', 'Admins cannot change role.');
  }

  if (callerIsAdmin && user.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Admins can update only role=user.');
  }

  if (payload.role === ROLE_SUPER_ADMIN && !callerIsSuperAdmin) {
    return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can assign role=superAdmin.');
  }

  if (payload.name !== undefined) {
    user.name = payload.name.trim();
  }

  if (payload.surname !== undefined) {
    user.surname = payload.surname.trim();
  }

  if (payload.email !== undefined) {
    const normalizedEmail = normalizeEmail(payload.email);
    if (normalizedEmail !== user.email) {
      const existing = await User.findOne({ email: normalizedEmail }).select('_id').exec();
      if (existing && String(existing._id) !== String(user._id)) {
        return sendError(res, 409, 'EMAIL_ALREADY_EXISTS', 'email already exists.');
      }
      user.email = normalizedEmail;
    }
  }

  if (payload.passCode !== undefined) {
    const credentials = await buildPassCodeCredentials(payload.passCode);
    const existingActivePassCodeUser = await User.findOne({
      passCodeLookup: credentials.passCodeLookup,
      isActive: true
    })
      .select('_id')
      .exec();

    if (existingActivePassCodeUser && String(existingActivePassCodeUser._id) !== String(user._id)) {
      return sendError(res, 409, 'PASSCODE_IN_USE', 'passCode is already assigned to an active user.');
    }

    user.passCodeHash = credentials.passCodeHash;
    user.passCodeLookup = credentials.passCodeLookup;
  }

  if (payload.paymentOption !== undefined) {
    user.paymentOption = payload.paymentOption;
  }

  if (payload.paymentAmount !== undefined) {
    user.paymentAmount = payload.paymentAmount;
  }

  if (payload.isActive !== undefined) {
    user.isActive = payload.isActive;
  }

  if (payload.role !== undefined && callerIsSuperAdmin && USER_ROLES.includes(payload.role)) {
    user.role = payload.role;
  }

  try {
    await user.save();
    return sendSuccess(res, toUserResponse(user));
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 409, 'EMAIL_ALREADY_EXISTS', 'email already exists.');
    }

    throw error;
  }
}

module.exports = withErrorHandling(requireAuth(handler));

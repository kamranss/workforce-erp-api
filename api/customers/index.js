const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { toCustomerResponse } = require('../../src/helpers/customers');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { decodeCursor, encodeCursor, parseJsonBody, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { validateCreateCustomerPayload } = require('../../src/validation/customerValidation');

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'POST']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
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

    if (req.query.q) {
      const q = String(req.query.q).trim();
      if (q) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        query.$or = [{ fullName: regex }, { address: regex }, { email: regex }, { phone: regex }];
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

    const docs = await Customer.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasNextPage = docs.length > limit;
    const pageItems = hasNextPage ? docs.slice(0, limit) : docs;

    return sendSuccess(res, {
      items: pageItems.map(toCustomerResponse),
      nextCursor: hasNextPage ? encodeCursor(docs[limit - 1]) : null
    });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateCreateCustomerPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid customer payload.', details);
  }

  const customer = await Customer.create({
    fullName: payload.fullName.trim(),
    address: payload.address === undefined || payload.address === null ? null : payload.address.trim(),
    email:
      payload.email === undefined || payload.email === null ? null : payload.email.trim().toLowerCase(),
    phone: payload.phone === undefined || payload.phone === null ? null : payload.phone.trim()
  });

  return sendSuccess(res, toCustomerResponse(customer), 201);
}

module.exports = withErrorHandling(requireAuth(handler));

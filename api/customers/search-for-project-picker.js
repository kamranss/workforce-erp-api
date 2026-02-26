const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { toCustomerResponse } = require('../../src/helpers/customers');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitName(fullName) {
  const source = String(fullName || '').trim();
  if (!source) {
    return { name: null, surname: null };
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { name: parts[0], surname: null };
  }

  return {
    name: parts[0],
    surname: parts.slice(1).join(' ')
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  await connectToDatabase();

  const limit = parseLimit(req.query.limit, 6, 100);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  const query = { isDeleted: { $ne: true } };

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    const tokens = q.split(/\s+/).map((part) => part.trim()).filter(Boolean).slice(0, 6);
    if (tokens.length > 0) {
      const tokenConditions = tokens.map((token) => {
        const regex = new RegExp(escapeForRegex(token), 'i');
        return {
          $or: [{ fullName: regex }, { address: regex }]
        };
      });

      query.$and = [...(query.$and || []), ...tokenConditions];
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
    items: pageItems.map((doc) => {
      const base = toCustomerResponse(doc);
      const nameParts = splitName(base.fullName);
      return {
        ...base,
        name: nameParts.name,
        surname: nameParts.surname
      };
    }),
    nextCursor: hasNextPage ? encodeCursor(docs[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

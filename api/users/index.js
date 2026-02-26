const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { buildPassCodeCredentials } = require('../../src/helpers/passcode');
const { ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_USER, isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const {
  parseJsonBody,
  parseLimit,
  encodeCursor,
  decodeCursor,
  toUserResponse
} = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { TimeEntry } = require('../../src/models/TimeEntry');
const { User } = require('../../src/models/User');
const { validateCreateUserPayload, normalizeEmail } = require('../../src/validation/userValidation');

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

    const query = {};
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      const tokens = q
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 6);

      if (tokens.length > 0) {
        query.$and = [
          ...(query.$and || []),
          ...tokens.map((token) => {
            const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');
            return {
              $or: [{ name: regex }, { surname: regex }]
            };
          })
        ];
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
      query.$and = [...(query.$and || []), cursorCondition];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasNextPage = users.length > limit;
    const pageUsers = hasNextPage ? users.slice(0, limit) : users;
    const pageUserIds = pageUsers.map((user) => user._id);

    const firstEntryRows = pageUserIds.length
      ? await TimeEntry.aggregate([
          {
            $match: {
              isDeleted: { $ne: true },
              userId: { $in: pageUserIds },
              clockInAt: { $ne: null }
            }
          },
          {
            $group: {
              _id: '$userId',
              firstEntryAt: { $min: '$clockInAt' }
            }
          }
        ])
      : [];
    const firstEntryByUserId = new Map(
      firstEntryRows.map((row) => [String(row._id), row.firstEntryAt || null])
    );

    const items = pageUsers.map((userDoc) => {
      const base = toUserResponse(userDoc);
      const paymentAmount = Number(base.paymentAmount || 0);
      const paymentOption = base.paymentOption || null;
      const paymentRateLabel =
        paymentOption === 'hourly'
          ? `$${paymentAmount.toFixed(2)}/hr`
          : paymentOption === 'monthly'
          ? `$${paymentAmount.toFixed(2)}/month`
          : `$${paymentAmount.toFixed(2)}`;
      const firstEntryAt = firstEntryByUserId.get(String(userDoc._id)) || null;

      return {
        ...base,
        paymentMethod: paymentOption,
        paymentRate: paymentAmount,
        paymentRateLabel,
        firstEntryAt,
        startDate: firstEntryAt
      };
    });

    const nextCursor = hasNextPage ? encodeCursor(users[limit - 1]) : null;
    return sendSuccess(res, {
      items,
      nextCursor
    });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateCreateUserPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid user payload.', details);
  }

  if (req.auth.role === ROLE_ADMIN && payload.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Admins can create only role=user.');
  }

  if (req.auth.role === ROLE_SUPER_ADMIN && ![ROLE_USER, ROLE_ADMIN].includes(payload.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'superAdmin can create only role=user or role=admin.');
  }

  const normalizedEmail = normalizeEmail(payload.email);
  const existing = await User.findOne({ email: normalizedEmail }).select('_id').exec();
  if (existing) {
    return sendError(res, 409, 'EMAIL_ALREADY_EXISTS', 'email already exists.');
  }

  const { passCodeHash, passCodeLookup } = await buildPassCodeCredentials(payload.passCode);
  const existingActivePassCodeUser = await User.findOne({
    passCodeLookup,
    isActive: true
  })
    .select('_id')
    .exec();

  if (existingActivePassCodeUser) {
    return sendError(res, 409, 'PASSCODE_IN_USE', 'passCode is already assigned to an active user.');
  }

  try {
    const user = await User.create({
      name: payload.name.trim(),
      surname: payload.surname.trim(),
      email: normalizedEmail,
      passCodeHash,
      passCodeLookup,
      role: payload.role,
      paymentOption: payload.paymentOption,
      paymentAmount: payload.paymentAmount,
      isActive: payload.isActive === undefined ? true : payload.isActive
    });

    return sendSuccess(res, toUserResponse(user), 201);
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 409, 'EMAIL_ALREADY_EXISTS', 'email already exists.');
    }

    throw error;
  }
}

module.exports = withErrorHandling(requireAuth(handler));

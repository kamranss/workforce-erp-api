const { connectToDatabase } = require('../../src/db/mongo');
const {
  TASK_DUE_MAX_DATE,
  buildTaskCursorMatch,
  decodeTaskCursor,
  encodeTaskCursor,
  toTaskResponse
} = require('../../src/helpers/tasks');
const { withErrorHandling } = require('../../src/helpers/handler');
const { ROLE_USER } = require('../../src/helpers/roles');
const { parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Task } = require('../../src/models/Task');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (req.auth.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Only user role can access this endpoint.');
  }

  await connectToDatabase();

  const limit = parseLimit(req.query.limit, 20, 100);
  const cursor = decodeTaskCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  const includeDone = req.query.includeDone === 'true';
  const match = {
    isDeleted: { $ne: true },
    assignedToUserIds: req.auth.userId
  };

  if (!includeDone) {
    match.status = { $ne: 'done' };
  }

  const pipeline = [
    { $match: match },
    { $addFields: { dueDateSort: { $ifNull: ['$dueDate', TASK_DUE_MAX_DATE] } } }
  ];

  const cursorMatch = buildTaskCursorMatch(cursor);
  if (cursorMatch) {
    pipeline.push({ $match: cursorMatch });
  }

  pipeline.push(
    { $sort: { dueDateSort: 1, createdAt: -1, _id: -1 } },
    { $limit: limit + 1 },
    { $project: { dueDateSort: 0 } }
  );

  const docs = await Task.aggregate(pipeline);
  const hasNextPage = docs.length > limit;
  const pageItems = hasNextPage ? docs.slice(0, limit) : docs;

  return sendSuccess(res, {
    items: pageItems.map(toTaskResponse),
    nextCursor: hasNextPage ? encodeTaskCursor(docs[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

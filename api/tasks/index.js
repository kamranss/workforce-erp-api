const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const {
  TASK_DUE_MAX_DATE,
  buildTaskCursorMatch,
  decodeTaskCursor,
  encodeTaskCursor,
  toTaskResponse
} = require('../../src/helpers/tasks');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin, ROLE_USER } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { parseJsonBody, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Project } = require('../../src/models/Project');
const { Task, TASK_STATUSES } = require('../../src/models/Task');
const { User } = require('../../src/models/User');
const { validateCreateTaskPayload } = require('../../src/validation/taskValidation');

function attachAssignedUsers(tasks, usersById) {
  return tasks.map((task) => {
    const assignedToUserIds = Array.isArray(task.assignedToUserIds) ? task.assignedToUserIds : [];
    return {
      ...task,
      assignedToUsers: assignedToUserIds
        .map((id) => usersById.get(String(id)))
        .filter(Boolean)
    };
  });
}

function normalizeTodoItems(todoItems, actorUserId) {
  if (!Array.isArray(todoItems)) {
    return [];
  }

  return todoItems.map((item) => {
    const isDone = item.isDone === true;
    return {
      text: item.text.trim(),
      isDone,
      doneAt: isDone ? (item.doneAt ? new Date(item.doneAt) : new Date()) : null,
      doneBy: isDone ? actorUserId : null
    };
  });
}

function buildTaskMatch(req) {
  const adminOrSuperAdmin = isAdminOrSuperAdmin(req.auth.role);
  const includeDeleted = adminOrSuperAdmin && req.query.includeDeleted === 'true';
  const match = includeDeleted ? {} : { isDeleted: { $ne: true } };

  if (req.auth.role === ROLE_USER) {
    match.assignedToUserIds = new mongoose.Types.ObjectId(req.auth.userId);
    return { match };
  }

  const includeDone = req.query.includeDone === 'true';
  if (!includeDone && req.query.status === undefined) {
    match.status = { $ne: 'done' };
  }

  if (req.query.status !== undefined) {
    if (!TASK_STATUSES.includes(req.query.status)) {
      return { error: 'status must be one of: created, progress, done.' };
    }
    match.status = req.query.status;
  }

  if (req.query.projectId !== undefined) {
    if (!isValidObjectId(req.query.projectId)) {
      return { error: 'projectId must be a valid ObjectId when provided.' };
    }
    match.projectId = new mongoose.Types.ObjectId(req.query.projectId);
  }

  if (req.query.assignedUserId !== undefined) {
    if (!isValidObjectId(req.query.assignedUserId)) {
      return { error: 'assignedUserId must be a valid ObjectId when provided.' };
    }
    match.assignedToUserIds = new mongoose.Types.ObjectId(req.query.assignedUserId);
  }

  if (req.query.dueFrom !== undefined || req.query.dueTo !== undefined) {
    const dueFrom = req.query.dueFrom ? new Date(req.query.dueFrom) : null;
    const dueTo = req.query.dueTo ? new Date(req.query.dueTo) : null;

    if (dueFrom && Number.isNaN(dueFrom.getTime())) {
      return { error: 'dueFrom must be a valid ISO date when provided.' };
    }
    if (dueTo && Number.isNaN(dueTo.getTime())) {
      return { error: 'dueTo must be a valid ISO date when provided.' };
    }

    match.dueDate = {};
    if (dueFrom) {
      match.dueDate.$gte = dueFrom;
    }
    if (dueTo) {
      match.dueDate.$lte = dueTo;
    }
  }

  if (req.query.q !== undefined) {
    const q = String(req.query.q).trim();
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      match.$or = [{ title: regex }, { description: regex }, { address: regex }];
    }
  }

  return { match };
}

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'POST']);
  }

  await connectToDatabase();

  if (req.method === 'GET') {
    const limit = parseLimit(req.query.limit, 20, 100);
    const cursor = decodeTaskCursor(req.query.cursor);
    if (req.query.cursor && !cursor) {
      return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
    }

    const { match, error } = buildTaskMatch(req);
    if (error) {
      return sendError(res, 400, 'VALIDATION_ERROR', error);
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
      { $sort: { createdAt: -1, dueDateSort: 1, _id: -1 } },
      { $limit: limit + 1 },
      { $project: { dueDateSort: 0 } }
    );

    const docs = await Task.aggregate(pipeline);
    const hasNextPage = docs.length > limit;
    const pageItems = hasNextPage ? docs.slice(0, limit) : docs;
    const assignedUserIds = Array.from(
      new Set(
        pageItems
          .flatMap((doc) => (Array.isArray(doc.assignedToUserIds) ? doc.assignedToUserIds : []))
          .map((id) => String(id))
      )
    );

    let usersById = new Map();
    if (assignedUserIds.length > 0) {
      const users = await User.find({ _id: { $in: assignedUserIds } })
        .select('name surname email')
        .lean()
        .exec();
      usersById = new Map(users.map((user) => [String(user._id), user]));
    }

    const enrichedItems = attachAssignedUsers(pageItems, usersById);

    return sendSuccess(res, {
      items: enrichedItems.map(toTaskResponse),
      nextCursor: hasNextPage ? encodeTaskCursor(docs[limit - 1]) : null
    });
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can create tasks.');
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateCreateTaskPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid task payload.', details);
  }

  if (payload.projectId) {
    const project = await Project.findById(payload.projectId).select('_id').exec();
    if (!project) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'projectId not found.');
    }
  }

  const assignedToUserIds = Array.isArray(payload.assignedToUserIds)
    ? payload.assignedToUserIds
    : [];
  const startDate = payload.startDate ? new Date(payload.startDate) : new Date();
  const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  if (dueDate && dueDate.getTime() < startDate.getTime()) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'dueDate must be greater than or equal to startDate.'
    );
  }

  const task = await Task.create({
    title: payload.title.trim(),
    description: payload.description,
    address: payload.address,
    startDate,
    dueDate,
    priority: payload.priority || 'medium',
    status: payload.status || 'created',
    projectId: payload.projectId || null,
    assignedToRole: assignedToUserIds.length > 0 ? 'user' : 'admin',
    assignedToUserIds,
    todoItems: normalizeTodoItems(payload.todoItems, req.auth.userId),
    createdBy: req.auth.userId
  });

  const createdTask = await Task.findById(task._id)
    .populate('assignedToUserIds', 'name surname email')
    .populate('todoItems.doneBy', 'name surname email')
    .exec();
  return sendSuccess(res, toTaskResponse(createdTask || task), 201);
}

module.exports = withErrorHandling(requireAuth(handler));

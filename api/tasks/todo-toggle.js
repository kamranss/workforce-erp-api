const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin, ROLE_USER } = require('../../src/helpers/roles');
const { toTaskResponse } = require('../../src/helpers/tasks');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Task } = require('../../src/models/Task');

function getRequestedId(req) {
  return typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
}

function canUserReadTask(task, userId) {
  const assigned = (task.assignedToUserIds || []).map((id) =>
    String(id && id._id ? id._id : id)
  );
  return assigned.includes(String(userId));
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  const id = getRequestedId(req);
  if (!id) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id query parameter is required.');
  }
  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid ObjectId.');
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
  if (!isValidObjectId(payload.todoItemId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'todoItemId is required and must be a valid ObjectId.');
  }
  if (typeof payload.isDone !== 'boolean') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'isDone is required and must be a boolean.');
  }

  await connectToDatabase();

  const task = await Task.findById(id)
    .populate('assignedToUserIds', 'name surname email')
    .populate('todoItems.doneBy', 'name surname email')
    .exec();
  if (!task || task.isDeleted === true) {
    return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found.');
  }

  const adminOrSuperAdmin = isAdminOrSuperAdmin(req.auth.role);
  if (req.auth.role === ROLE_USER) {
    if (!canUserReadTask(task, req.auth.userId)) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only update todo items on tasks assigned to you.');
    }
  } else if (!adminOrSuperAdmin) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin, superAdmin, or assigned users can update todo items.');
  }

  const todoItem = task.todoItems.id(payload.todoItemId);
  if (!todoItem) {
    return sendError(res, 404, 'TASK_TODO_NOT_FOUND', 'Todo item not found.');
  }

  todoItem.isDone = payload.isDone;
  todoItem.doneAt = payload.isDone ? new Date() : null;
  todoItem.doneBy = payload.isDone ? req.auth.userId : null;

  await task.save();

  const updatedTask = await Task.findById(task._id)
    .populate('assignedToUserIds', 'name surname email')
    .populate('todoItems.doneBy', 'name surname email')
    .exec();

  return sendSuccess(res, toTaskResponse(updatedTask || task));
}

module.exports = withErrorHandling(requireAuth(handler));

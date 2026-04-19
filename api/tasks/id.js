const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin, isSuperAdmin, ROLE_USER } = require('../../src/helpers/roles');
const {
  sendSecurityAlert,
  buildTaskStatusUpdatedAlertPayload
} = require('../../src/helpers/securityAlerts');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { toTaskResponse } = require('../../src/helpers/tasks');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');
const { Task } = require('../../src/models/Task');
const { User } = require('../../src/models/User');
const { validatePatchTaskPayload } = require('../../src/validation/taskValidation');
void Customer;

function getRequestedId(req) {
  return typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
}

function canUserReadTask(task, userId) {
  const assigned = (task.assignedToUserIds || []).map((id) =>
    String(id && id._id ? id._id : id)
  );
  return assigned.includes(String(userId));
}

function toOptionalId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value._id) {
    return String(value._id);
  }

  if (value.id) {
    return String(value.id);
  }

  return null;
}

function normalizeTodoItems(todoItems) {
  if (!Array.isArray(todoItems)) {
    return [];
  }

  return todoItems.map((item) => {
    const isDone = item.isDone === true;
    return {
      _id: item.id,
      text: item.text.trim(),
      isDone,
      doneAt: isDone ? (item.doneAt ? new Date(item.doneAt) : new Date()) : null,
      doneBy: isDone ? toOptionalId(item.doneBy) : null
    };
  });
}

async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }

  const id = getRequestedId(req);
  if (!id) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id query parameter is required.');
  }
  if (!isValidObjectId(id)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid ObjectId.');
  }

  await connectToDatabase();

  const task = await Task.findById(id)
    .populate('assignedToUserIds', 'name surname email')
    .populate('todoItems.doneBy', 'name surname email')
    .exec();
  if (!task) {
    return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found.');
  }

  const adminOrSuperAdmin = isAdminOrSuperAdmin(req.auth.role);
  const includeDeleted = adminOrSuperAdmin && req.query.includeDeleted === 'true';
  if (task.isDeleted === true && !includeDeleted) {
    return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found.');
  }

  if (req.auth.role === ROLE_USER) {
    if (!canUserReadTask(task, req.auth.userId)) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only access tasks assigned to you.');
    }

    if (req.method === 'DELETE') {
      return sendError(res, 403, 'FORBIDDEN', 'User role cannot delete tasks.');
    }
  } else if (!adminOrSuperAdmin) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  if (req.method === 'GET') {
    return sendSuccess(res, toTaskResponse(task));
  }

  if (req.method === 'DELETE') {
    if (!isSuperAdmin(req.auth.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can delete tasks.');
    }

    task.isDeleted = true;
    task.deletedAt = new Date();
    task.deletedBy = req.auth.userId;
    await task.save();
    return sendSuccess(res, { id: String(task._id), isDeleted: true });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validatePatchTaskPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid task update payload.', details);
  }

  if (req.auth.role === ROLE_USER) {
    const keys = Object.keys(payload);
    if (keys.length !== 1 || payload.status === undefined) {
      return sendError(
        res,
        403,
        'FORBIDDEN',
        'User role can update only task status for assigned tasks.'
      );
    }
  }

  if (payload.projectId !== undefined && payload.projectId !== null) {
    const project = await Project.findById(payload.projectId).select('_id').exec();
    if (!project) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'projectId not found.');
    }
  }

  const statusBefore = task.status;

  if (payload.title !== undefined) {
    task.title = payload.title.trim();
  }
  if (payload.description !== undefined) {
    task.description = payload.description;
  }
  if (payload.address !== undefined) {
    task.address = payload.address;
  }
  if (payload.startDate !== undefined) {
    task.startDate = payload.startDate ? new Date(payload.startDate) : null;
  }
  if (payload.dueDate !== undefined) {
    task.dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  }
  if (payload.priority !== undefined) {
    task.priority = payload.priority;
  }
  if (payload.status !== undefined) {
    task.status = payload.status;
  }
  if (payload.projectId !== undefined) {
    task.projectId = payload.projectId || null;
  }
  if (payload.assignedToUserIds !== undefined) {
    task.assignedToUserIds = payload.assignedToUserIds;
    task.assignedToRole = payload.assignedToUserIds.length > 0 ? 'user' : 'admin';
  }
  if (payload.todoItems !== undefined) {
    task.todoItems = normalizeTodoItems(payload.todoItems);
  }

  if (task.startDate && task.dueDate && task.dueDate.getTime() < task.startDate.getTime()) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'dueDate must be greater than or equal to startDate.'
    );
  }

  await task.save();

  if (payload.status !== undefined && statusBefore !== task.status) {
    const [actor, projectDoc] = await Promise.all([
      User.findById(req.auth.userId).select('name surname email role').exec(),
      task.projectId
        ? Project.findById(task.projectId).populate('customerId', 'fullName address email phone').exec()
        : Promise.resolve(null)
    ]);

    try {
      await sendSecurityAlert(
        buildTaskStatusUpdatedAlertPayload({
          req,
          actor,
          task,
          statusFrom: statusBefore,
          statusTo: task.status,
          project: projectDoc
        })
      );
    } catch (error) {
      console.warn('[security-alert] delivery failed:', error?.message || error);
    }
  }

  const updatedTask = await Task.findById(task._id)
    .populate('assignedToUserIds', 'name surname email')
    .populate('todoItems.doneBy', 'name surname email')
    .exec();
  return sendSuccess(res, toTaskResponse(updatedTask || task));
}

module.exports = withErrorHandling(requireAuth(handler));

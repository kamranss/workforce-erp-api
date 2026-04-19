const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { ROLE_USER } = require('../../src/helpers/roles');
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
const { Task, TASK_STATUSES } = require('../../src/models/Task');
const { User } = require('../../src/models/User');
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

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return sendMethodNotAllowed(res, ['PATCH']);
  }

  if (req.auth.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Only user role can access this endpoint.');
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
  const keys = Object.keys(payload);
  if (keys.length !== 1 || payload.status === undefined) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Only status can be updated via this endpoint.'
    );
  }
  if (!TASK_STATUSES.includes(payload.status)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'status must be one of: created, progress, done.');
  }

  await connectToDatabase();

  const task = await Task.findById(id).populate('assignedToUserIds', 'name surname email').exec();
  if (!task || task.isDeleted === true) {
    return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found.');
  }

  if (!canUserReadTask(task, req.auth.userId)) {
    return sendError(res, 403, 'FORBIDDEN', 'You can only update status on tasks assigned to you.');
  }

  const statusBefore = task.status;
  task.status = payload.status;
  await task.save();

  if (statusBefore !== task.status) {
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
    .exec();
  return sendSuccess(res, toTaskResponse(updatedTask || task));
}

module.exports = withErrorHandling(requireAuth(handler));

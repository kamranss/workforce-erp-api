const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin, isSuperAdmin } = require('../../src/helpers/roles');
const {
  getLocalDateKey,
  isValidObjectId,
  recomputeDailyBreakAllocation,
  toTimeEntryResponse
} = require('../../src/helpers/timeEntries');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { Project } = require('../../src/models/Project');
const { TimeEntry } = require('../../src/models/TimeEntry');
const { validateAdminPatchPayload } = require('../../src/validation/timeEntryValidation');

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

  if (!isValidObjectId(requestedId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid ObjectId.');
  }

  await connectToDatabase();
  const includeDeleted = req.query.includeDeleted === 'true';
  const entry = await TimeEntry.findById(requestedId).exec();

  if (!entry) {
    return sendError(res, 404, 'TIME_ENTRY_NOT_FOUND', 'Time entry not found.');
  }

  const adminOrSuperAdmin = isAdminOrSuperAdmin(req.auth.role);
  if (!adminOrSuperAdmin && String(entry.userId) !== req.auth.userId) {
    return sendError(res, 403, 'FORBIDDEN', 'You can only access your own time entries.');
  }

  if (entry.isDeleted === true && (!adminOrSuperAdmin || !includeDeleted)) {
    return sendError(res, 404, 'TIME_ENTRY_NOT_FOUND', 'Time entry not found.');
  }

  if (req.method === 'GET') {
    return sendSuccess(res, toTimeEntryResponse(entry));
  }

  if (req.method === 'DELETE') {
    if (!isSuperAdmin(req.auth.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can delete time entries.');
    }

    entry.isDeleted = true;
    entry.deletedAt = new Date();
    entry.deletedBy = req.auth.userId;
    if (!entry.clockOutAt) {
      entry.clockOutAt = entry.deletedAt;
      if (!entry.projectIdOut) {
        entry.projectIdOut = entry.projectIdIn || entry.projectId || null;
      }
    }
    await entry.save();

    if (entry.clockOutAt) {
      await recomputeDailyBreakAllocation({
        userId: entry.userId,
        referenceDate: entry.clockInAt,
        timeZone: 'America/Chicago'
      });
    }

    return sendSuccess(res, {
      id: String(entry._id),
      isDeleted: true
    });
  }

  if (!adminOrSuperAdmin) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can update time entries.');
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateAdminPatchPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid time entry update payload.', details);
  }
  const previousClockInAt = entry.clockInAt;

  if (payload.projectIdIn !== undefined) {
    const projectIn = await Project.findById(payload.projectIdIn).select('_id').exec();
    if (!projectIn) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'projectIdIn not found.');
    }
    entry.projectIdIn = payload.projectIdIn;
    entry.projectId = payload.projectIdIn;
  }

  if (payload.projectIdOut !== undefined) {
    if (payload.projectIdOut === null) {
      entry.projectIdOut = null;
    } else {
      const projectOut = await Project.findById(payload.projectIdOut).select('_id').exec();
      if (!projectOut) {
        return sendError(res, 404, 'PROJECT_NOT_FOUND', 'projectIdOut not found.');
      }
      entry.projectIdOut = payload.projectIdOut;
    }
  }

  if (payload.clockInAt !== undefined) {
    entry.clockInAt = new Date(payload.clockInAt);
  }

  if (payload.clockOutAt !== undefined) {
    entry.clockOutAt = payload.clockOutAt === null ? null : new Date(payload.clockOutAt);
  }

  if (entry.clockOutAt && entry.clockOutAt.getTime() < entry.clockInAt.getTime()) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'clockOutAt must be greater than or equal to clockInAt.');
  }

  if (payload.geoIn !== undefined) {
    entry.geoIn = payload.geoIn;
  }

  if (payload.geoOut !== undefined) {
    entry.geoOut = payload.geoOut;
  }

  if (payload.addrIn !== undefined) {
    entry.addrIn = payload.addrIn;
  }

  if (payload.addrOut !== undefined) {
    entry.addrOut = payload.addrOut;
  }

  if (payload.notes !== undefined) {
    entry.notes = payload.notes;
  }

  if (entry.clockOutAt === null) {
    const openEntry = await TimeEntry.findOne({
      userId: entry.userId,
      clockOutAt: null,
      isDeleted: { $ne: true },
      _id: { $ne: entry._id }
    })
      .select('_id')
      .exec();

    if (openEntry) {
      return sendError(res, 409, 'OPEN_ENTRY_EXISTS', 'User already has another open time entry.');
    }
  }

  try {
    await entry.save();
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 409, 'OPEN_ENTRY_EXISTS', 'User already has an open time entry.');
    }

    throw error;
  }

  const recomputeDates = [previousClockInAt, entry.clockInAt];
  const seenKeys = new Set();

  for (const date of recomputeDates) {
    if (!date) {
      continue;
    }

    const key = getLocalDateKey(date, 'America/Chicago');
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    await recomputeDailyBreakAllocation({
      userId: entry.userId,
      referenceDate: date,
      timeZone: 'America/Chicago'
    });
  }

  if (!entry.clockOutAt) {
    entry.rawMinutes = null;
    entry.breakMinutes = 0;
    entry.minutesWorked = null;
    await entry.save();
  }

  const updatedEntry = await TimeEntry.findById(entry._id).exec();
  return sendSuccess(res, toTimeEntryResponse(updatedEntry));
}

module.exports = withErrorHandling(requireAuth(handler));

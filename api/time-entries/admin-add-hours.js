const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { recomputeDailyBreakAllocation, toTimeEntryResponse, isValidObjectId } = require('../../src/helpers/timeEntries');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { Project } = require('../../src/models/Project');
const { TimeEntry } = require('../../src/models/TimeEntry');
const { User } = require('../../src/models/User');

function validatePayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isValidObjectId(payload.userId)) {
    details.push('userId is required and must be a valid ObjectId.');
  }

  if (!isValidObjectId(payload.projectId)) {
    details.push('projectId is required and must be a valid ObjectId.');
  }

  if (!payload.clockInAt || Number.isNaN(new Date(payload.clockInAt).getTime())) {
    details.push('clockInAt is required and must be a valid ISO date.');
  }

  if (!payload.clockOutAt || Number.isNaN(new Date(payload.clockOutAt).getTime())) {
    details.push('clockOutAt is required and must be a valid ISO date.');
  }

  if (payload.notes !== undefined && payload.notes !== null && typeof payload.notes !== 'string') {
    details.push('notes must be a string or null when provided.');
  }

  return details;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can add hours.');
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validatePayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid add-hours payload.', details);
  }

  const clockInAt = new Date(payload.clockInAt);
  const clockOutAt = new Date(payload.clockOutAt);
  if (clockOutAt.getTime() < clockInAt.getTime()) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'clockOutAt must be greater than or equal to clockInAt.');
  }

  await connectToDatabase();

  const [user, project] = await Promise.all([
    User.findById(payload.userId).exec(),
    Project.findById(payload.projectId).exec()
  ]);

  if (!user) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
  }

  if (!project) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }

  try {
    const entry = await TimeEntry.create({
      userId: payload.userId,
      projectIdIn: payload.projectId,
      projectIdOut: payload.projectId,
      projectId: payload.projectId,
      clockInAt,
      clockOutAt,
      rawMinutes: null,
      breakMinutes: 0,
      minutesWorked: null,
      hourlyRateAtTime: user.paymentOption === 'hourly' ? user.paymentAmount : null,
      notes: payload.notes
    });

    await recomputeDailyBreakAllocation({
      userId: entry.userId,
      referenceDate: entry.clockInAt,
      timeZone: 'America/Chicago'
    });

    const updatedEntry = await TimeEntry.findById(entry._id).exec();
    return sendSuccess(res, toTimeEntryResponse(updatedEntry), 201);
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 409, 'OPEN_ENTRY_EXISTS', 'User already has an open time entry.');
    }

    throw error;
  }
}

module.exports = withErrorHandling(requireAuth(handler));

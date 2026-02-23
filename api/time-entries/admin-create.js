const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { recomputeDailyBreakAllocation, toTimeEntryResponse } = require('../../src/helpers/timeEntries');
const { parseJsonBody } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { Project } = require('../../src/models/Project');
const { TimeEntry } = require('../../src/models/TimeEntry');
const { User } = require('../../src/models/User');
const { validateAdminCreatePayload } = require('../../src/validation/timeEntryValidation');

function toDate(value) {
  return new Date(value);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can create entries.');
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateAdminCreatePayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid admin create payload.', details);
  }

  await connectToDatabase();

  const [user, projectIn, projectOut] = await Promise.all([
    User.findById(payload.userId).exec(),
    Project.findById(payload.projectIdIn).exec(),
    payload.projectIdOut ? Project.findById(payload.projectIdOut).exec() : Promise.resolve(null)
  ]);

  if (!user) {
    return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
  }

  if (!projectIn) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'projectIdIn not found.');
  }

  if (payload.projectIdOut && !projectOut) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'projectIdOut not found.');
  }

  const clockInAt = toDate(payload.clockInAt);
  const clockOutAt = payload.clockOutAt ? toDate(payload.clockOutAt) : null;

  if (clockOutAt && clockOutAt.getTime() < clockInAt.getTime()) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'clockOutAt must be greater than or equal to clockInAt.');
  }

  const existingOpenEntry = await TimeEntry.findOne({
    userId: payload.userId,
    clockOutAt: null,
    isDeleted: { $ne: true }
  })
    .select('_id')
    .exec();

  if (!clockOutAt && existingOpenEntry) {
    return sendError(res, 409, 'OPEN_ENTRY_EXISTS', 'User already has an open time entry.');
  }

  try {
    const entry = await TimeEntry.create({
      userId: payload.userId,
      projectIdIn: payload.projectIdIn,
      projectIdOut: payload.projectIdOut || null,
      projectId: payload.projectIdIn,
      clockInAt,
      clockOutAt,
      rawMinutes: null,
      breakMinutes: 0,
      minutesWorked: null,
      hourlyRateAtTime: user.paymentOption === 'hourly' ? user.paymentAmount : null,
      geoIn: payload.geoIn || null,
      geoOut: payload.geoOut || null,
      addrIn: payload.addrIn,
      addrOut: payload.addrOut,
      notes: payload.notes
    });

    if (clockOutAt) {
      await recomputeDailyBreakAllocation({
        userId: entry.userId,
        referenceDate: entry.clockInAt,
        timeZone: 'America/Chicago'
      });
    }

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

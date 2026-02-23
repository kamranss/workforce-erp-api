const { connectToDatabase } = require('../../src/db/mongo');
const { isWithinRadius } = require('../../src/helpers/geo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { ROLE_USER } = require('../../src/helpers/roles');
const { parseJsonBody } = require('../../src/helpers/users');
const { recomputeDailyBreakAllocation, toTimeEntryResponse } = require('../../src/helpers/timeEntries');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { Project } = require('../../src/models/Project');
const { TimeEntry } = require('../../src/models/TimeEntry');
const { validateCheckOutPayload } = require('../../src/validation/timeEntryValidation');
const ALLOWED_CHECK_STATUSES = new Set(['waiting', 'ongoing', 'finished']);

function getProjectRadiusMeters(project) {
  return typeof project.geoRadiusMeters === 'number' ? project.geoRadiusMeters : 500;
}

function projectCanReceiveEntry(project) {
  return (
    project &&
    project.isActive === true &&
    ALLOWED_CHECK_STATUSES.has(project.status) &&
    typeof project.geo?.lat === 'number' &&
    typeof project.geo?.lng === 'number'
  );
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  if (req.auth.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Only users can check out.');
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateCheckOutPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid check-out payload.', details);
  }

  await connectToDatabase();

  const entry = await TimeEntry.findOne({
    userId: req.auth.userId,
    clockOutAt: null,
    isDeleted: { $ne: true }
  }).exec();

  if (!entry) {
    return sendError(res, 404, 'OPEN_ENTRY_NOT_FOUND', 'No open time entry found for user.');
  }

  const project = await Project.findById(payload.projectIdOut).exec();
  if (!project) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }

  if (!projectCanReceiveEntry(project)) {
    return sendError(
      res,
      400,
      'PROJECT_NOT_ELIGIBLE',
      'Project must be active, in waiting/ongoing/finished status, and have geo.lat/lng.'
    );
  }

  const radiusMeters = getProjectRadiusMeters(project);
  const distance = isWithinRadius(
    {
      lat: payload.geoOut.lat,
      lng: payload.geoOut.lng
    },
    {
      lat: project.geo.lat,
      lng: project.geo.lng
    },
    radiusMeters
  );

  if (!distance.allowed) {
    return sendError(
      res,
      403,
      'OUTSIDE_GEOFENCE',
      'User is outside the allowed geofence radius.',
      {
        distanceMeters: distance.distanceMeters,
        radiusMeters
      }
    );
  }

  const clockOutAt = new Date();
  entry.projectIdOut = project._id;
  entry.clockOutAt = clockOutAt;
  entry.geoOut = {
    lat: payload.geoOut.lat,
    lng: payload.geoOut.lng
  };
  entry.addrOut = payload.addrOut;
  if (payload.notes !== undefined) {
    entry.notes = payload.notes;
  }
  await entry.save();
  await recomputeDailyBreakAllocation({
    userId: entry.userId,
    referenceDate: entry.clockInAt,
    timeZone: 'America/Chicago'
  });

  const updatedEntry = await TimeEntry.findById(entry._id).exec();
  if (!updatedEntry) {
    return sendError(res, 404, 'TIME_ENTRY_NOT_FOUND', 'Time entry not found after update.');
  }
  return sendSuccess(res, toTimeEntryResponse(updatedEntry));
}

module.exports = withErrorHandling(requireAuth(handler));

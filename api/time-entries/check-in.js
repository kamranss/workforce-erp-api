const { connectToDatabase } = require('../../src/db/mongo');
const { haversineDistanceMeters, isWithinRadius } = require('../../src/helpers/geo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { ROLE_USER } = require('../../src/helpers/roles');
const { parseJsonBody } = require('../../src/helpers/users');
const { sendSecurityAlert, buildCheckInAlertPayload } = require('../../src/helpers/securityAlerts');
const { toTimeEntryResponse } = require('../../src/helpers/timeEntries');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');
const { TimeEntry } = require('../../src/models/TimeEntry');
const { User } = require('../../src/models/User');
const { validateCheckInPayload } = require('../../src/validation/timeEntryValidation');
void Customer;
const ALLOWED_CHECK_STATUSES = new Set(['waiting', 'ongoing', 'review']);
const MIN_GEOFENCE_RADIUS_METERS = 600;

function getProjectRadiusMeters(project) {
  const configured =
    typeof project.geoRadiusMeters === 'number' && Number.isFinite(project.geoRadiusMeters)
      ? project.geoRadiusMeters
      : MIN_GEOFENCE_RADIUS_METERS;

  return Math.max(configured, MIN_GEOFENCE_RADIUS_METERS);
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
    return sendError(res, 403, 'FORBIDDEN', 'Only users can check in.');
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validateCheckInPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid check-in payload.', details);
  }

  await connectToDatabase();

  const openEntry = await TimeEntry.findOne({
    userId: req.auth.userId,
    clockOutAt: null,
    isDeleted: { $ne: true }
  })
    .select('_id')
    .exec();

  if (openEntry) {
    return sendError(res, 409, 'OPEN_ENTRY_EXISTS', 'User already has an open time entry.');
  }

  const selectedProjectId = payload.projectIdIn || payload.projectId;

  const [user, directProject] = await Promise.all([
    User.findById(req.auth.userId).exec(),
    selectedProjectId
      ? Project.findById(selectedProjectId).populate('customerId', 'fullName address email phone').exec()
      : Promise.resolve(null)
  ]);

  let project = directProject;
  let autoSelected = false;

  if (!selectedProjectId) {
    const candidates = await Project.find({
      isActive: true,
      status: { $in: [...ALLOWED_CHECK_STATUSES] },
      'geo.lat': { $type: 'number' },
      'geo.lng': { $type: 'number' }
    })
      .populate('customerId', 'fullName address email phone')
      .exec();

    let best = null;
    for (const candidate of candidates) {
      const radiusMeters = getProjectRadiusMeters(candidate);
      const distance = haversineDistanceMeters(
        { lat: payload.geoIn.lat, lng: payload.geoIn.lng },
        { lat: candidate.geo.lat, lng: candidate.geo.lng }
      );

      if (distance > radiusMeters) {
        continue;
      }

      if (!best || distance < best.distance) {
        best = { project: candidate, distance };
      }
    }

    if (!best) {
      return sendError(
        res,
        404,
        'NO_MATCHING_PROJECT',
        'No eligible project found near your location. Choose a project manually.'
      );
    }

    project = best.project;
    autoSelected = true;
  }

  if (!project) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }

  if (!projectCanReceiveEntry(project)) {
    return sendError(
      res,
      400,
      'PROJECT_NOT_ELIGIBLE',
      'Project must be active, in waiting/ongoing/review status, and have geo.lat/lng.'
    );
  }

  if (!user || !user.isActive) {
    return sendError(res, 403, 'FORBIDDEN', 'Inactive or missing user cannot check in.');
  }

  const radiusMeters = getProjectRadiusMeters(project);
  const distance = isWithinRadius(
    {
      lat: payload.geoIn.lat,
      lng: payload.geoIn.lng
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

  try {
    const entry = await TimeEntry.create({
      userId: req.auth.userId,
      projectIdIn: project._id,
      projectId: project._id,
      clockInAt: new Date(),
      breakMinutes: 0,
      rawMinutes: null,
      minutesWorked: null,
      hourlyRateAtTime: user.paymentOption === 'hourly' ? user.paymentAmount : null,
      geoIn: {
        lat: payload.geoIn.lat,
        lng: payload.geoIn.lng
      },
      addrIn: payload.addrIn,
      notes: payload.notes
    });

    // First successful check-in starts the project lifecycle.
    if (project.status === 'waiting') {
      const now = new Date();
      const setStarted = await Project.updateOne(
        { _id: project._id, status: 'waiting', actualStartAt: null },
        { $set: { status: 'ongoing', actualStartAt: now, actualEndAt: null, actualDurationDays: null } }
      ).exec();

      if (setStarted.modifiedCount === 0) {
        await Project.updateOne(
          { _id: project._id, status: 'waiting' },
          { $set: { status: 'ongoing', actualEndAt: null, actualDurationDays: null } }
        ).exec();
      }
    }
    try {
      await sendSecurityAlert(
        buildCheckInAlertPayload({
          req,
          user,
          project,
          entry
        })
      );
    } catch (error) {
      console.warn('[security-alert] delivery failed:', error?.message || error);
    }

    return sendSuccess(
      res,
      {
        ...toTimeEntryResponse(entry),
        selectedProjectMode: autoSelected ? 'auto' : 'manual'
      },
      201
    );
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 409, 'OPEN_ENTRY_EXISTS', 'User already has an open time entry.');
    }

    throw error;
  }
}

module.exports = withErrorHandling(requireAuth(handler));

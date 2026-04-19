const { connectToDatabase } = require('../../src/db/mongo');
const { haversineDistanceMeters, isWithinRadius } = require('../../src/helpers/geo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { ROLE_USER } = require('../../src/helpers/roles');
const { parseJsonBody } = require('../../src/helpers/users');
const {
  sendSecurityAlert,
  buildCheckOutAlertPayload
} = require('../../src/helpers/securityAlerts');
const { recomputeDailyBreakAllocation, toTimeEntryResponse } = require('../../src/helpers/timeEntries');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');
const { TimeEntry } = require('../../src/models/TimeEntry');
const { User } = require('../../src/models/User');
const { validateCheckOutPayload } = require('../../src/validation/timeEntryValidation');
void Customer;
const ALLOWED_CHECK_STATUSES = new Set(['waiting', 'ongoing', 'review', 'finished']);
const MIN_GEOFENCE_RADIUS_METERS = 600;
const CHECKOUT_AUTO_PROJECT_FALLBACK_ENABLED = true;

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

async function findNearestEligibleCheckoutProject_(geoOut) {
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
    const distanceMeters = haversineDistanceMeters(
      { lat: geoOut.lat, lng: geoOut.lng },
      { lat: candidate.geo.lat, lng: candidate.geo.lng }
    );

    if (distanceMeters > radiusMeters) {
      continue;
    }

    if (!best || distanceMeters < best.distanceMeters) {
      best = { project: candidate, distanceMeters, radiusMeters };
    }
  }

  return best;
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

  const details = validateCheckOutPayload(payload, {
    allowMissingProjectIdOut: CHECKOUT_AUTO_PROJECT_FALLBACK_ENABLED
  });
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

  const hasManualProjectId = typeof payload.projectIdOut === 'string' && payload.projectIdOut.trim() !== '';
  let project = null;
  let selectedProjectMode = 'manual';
  let fallbackDistanceMeters = null;
  let fallbackRadiusMeters = null;

  if (hasManualProjectId) {
    project = await Project.findById(payload.projectIdOut)
      .populate('customerId', 'fullName address email phone')
      .exec();
    if (!project) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
  } else if (CHECKOUT_AUTO_PROJECT_FALLBACK_ENABLED) {
    const nearest = await findNearestEligibleCheckoutProject_(payload.geoOut);
    if (!nearest) {
      return sendError(
        res,
        404,
        'NO_MATCHING_PROJECT',
        'No eligible project found near your location. Provide projectIdOut or move closer to a project geofence.'
      );
    }

    project = nearest.project;
    selectedProjectMode = 'fallback-auto';
    fallbackDistanceMeters = nearest.distanceMeters;
    fallbackRadiusMeters = nearest.radiusMeters;
  } else {
    return sendError(res, 400, 'VALIDATION_ERROR', 'projectIdOut is required.');
  }

  if (!projectCanReceiveEntry(project)) {
    return sendError(
      res,
      400,
      'PROJECT_NOT_ELIGIBLE',
      'Project must be active, in waiting/ongoing/review/finished status, and have geo.lat/lng.'
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
  const user = await User.findById(req.auth.userId).select('name surname email role').exec();
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
  try {
    await sendSecurityAlert(
      buildCheckOutAlertPayload({
        req,
        user,
        project,
        entry
      })
    );
  } catch (error) {
    console.warn('[security-alert] delivery failed:', error?.message || error);
  }
  return sendSuccess(res, {
    ...toTimeEntryResponse(updatedEntry),
    selectedProjectMode,
    geofence: {
      distanceMeters: selectedProjectMode === 'fallback-auto' ? fallbackDistanceMeters : distance.distanceMeters,
      radiusMeters: selectedProjectMode === 'fallback-auto' ? fallbackRadiusMeters : radiusMeters
    }
  });
}

module.exports = withErrorHandling(requireAuth(handler));

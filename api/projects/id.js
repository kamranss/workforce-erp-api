const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { parseJsonBody } = require('../../src/helpers/users');
const { toProjectResponse, applyProjectPatch, enrichProjectPayload } = require('../../src/helpers/projects');
const { isAdminOrSuperAdmin, isSuperAdmin } = require('../../src/helpers/roles');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');
const { validatePatchProjectPayload } = require('../../src/validation/projectValidation');

function getRequestedId(req) {
  return typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
}

function hasProjectGeo(project) {
  return (
    typeof project.geo?.lat === 'number' &&
    Number.isFinite(project.geo.lat) &&
    typeof project.geo?.lng === 'number' &&
    Number.isFinite(project.geo.lng)
  );
}

async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }

  const requestedId = getRequestedId(req);
  if (!requestedId) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id query parameter is required.');
  }

  if (!mongoose.Types.ObjectId.isValid(requestedId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'id must be a valid MongoDB ObjectId.');
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  await connectToDatabase();
  const project = await Project.findById(requestedId)
    .populate('customerId', 'fullName address email phone')
    .exec();

  if (!project) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }

  if (req.method === 'GET') {
    return sendSuccess(res, toProjectResponse(project));
  }

  if (req.method === 'DELETE') {
    if (!isSuperAdmin(req.auth.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Only superAdmin can delete projects.');
    }

    project.isActive = false;
    await project.save();
    return sendSuccess(res, {
      id: String(project._id),
      isActive: false
    });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const details = validatePatchProjectPayload(payload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid project update payload.', details);
  }

  if (payload.customerId !== undefined && payload.customerId !== null) {
    const customer = await Customer.findById(payload.customerId).select('_id isDeleted').exec();
    if (!customer || customer.isDeleted === true) {
      return sendError(res, 404, 'CUSTOMER_NOT_FOUND', 'customerId not found.');
    }
  }

  applyProjectPatch(project, payload);

  if (payload.address && payload.address.raw !== undefined) {
    const enrichedPatch = await enrichProjectPayload(
      {
        locationKey: payload.locationKey !== undefined ? payload.locationKey : project.locationKey,
        address: {
          raw: project.address?.raw,
          normalized: project.address?.normalized,
          lat: project.address?.lat,
          lng: project.address?.lng
        },
        geo: {
          lat: project.geo?.lat,
          lng: project.geo?.lng
        }
      },
      {
        forceLocationKey: payload.locationKey === undefined
      }
    );

    if (enrichedPatch.locationKey) {
      project.locationKey = enrichedPatch.locationKey;
    }

    if (enrichedPatch.address) {
      if (enrichedPatch.address.normalized !== undefined) {
        project.address.normalized = enrichedPatch.address.normalized;
      }

      if (enrichedPatch.address.lat !== undefined) {
        project.address.lat = enrichedPatch.address.lat;
      }

      if (enrichedPatch.address.lng !== undefined) {
        project.address.lng = enrichedPatch.address.lng;
      }
    }

    if (enrichedPatch.geo) {
      if (!project.geo) {
        project.geo = {};
      }

      if (enrichedPatch.geo.lat !== undefined) {
        project.geo.lat = enrichedPatch.geo.lat;
      }

      if (enrichedPatch.geo.lng !== undefined) {
        project.geo.lng = enrichedPatch.geo.lng;
      }
    }
  }

  if (project.status === 'ongoing' && !hasProjectGeo(project)) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'geo.lat and geo.lng are required when status is ongoing.'
    );
  }

  await project.save();
  const updatedProject = await Project.findById(project._id)
    .populate('customerId', 'fullName address email phone')
    .exec();
  return sendSuccess(res, toProjectResponse(updatedProject));
}

module.exports = withErrorHandling(requireAuth(handler));

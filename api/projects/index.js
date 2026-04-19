const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const {
  parseJsonBody,
  parseLimit,
  encodeCursor,
  decodeCursor
} = require('../../src/helpers/users');
const {
  toProjectResponse,
  sanitizeCreateProjectPayload,
  syncProjectActualDurationDays,
  buildProjectListFilters,
  enrichProjectPayload
} = require('../../src/helpers/projects');
const { syncProjectReferralExpense } = require('../../src/helpers/referralExpenses');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { requireAuth } = require('../../src/middleware/auth');
const { sendMethodNotAllowed, sendError, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');
const { validateCreateProjectPayload } = require('../../src/validation/projectValidation');

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'POST']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  await connectToDatabase();

  if (req.method === 'GET') {
    const limit = parseLimit(req.query.limit, 10, 100);
    const cursor = decodeCursor(req.query.cursor);

    if (req.query.cursor && !cursor) {
      return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
    }

    const filterResult = buildProjectListFilters(req.query);
    if (filterResult.error) {
      return sendError(res, 400, 'VALIDATION_ERROR', filterResult.error);
    }

    const query = filterResult.filter;
    if (cursor) {
      const cursorCondition = {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            _id: { $lt: new mongoose.Types.ObjectId(cursor.id) }
          }
        ]
      };

      if (Object.keys(query).length === 0) {
        Object.assign(query, cursorCondition);
      } else {
        query.$and = [...(query.$and || []), cursorCondition];
      }
    }

    const projects = await Project.find(query)
      .populate('customerId', 'fullName address email phone')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasNextPage = projects.length > limit;
    const items = (hasNextPage ? projects.slice(0, limit) : projects).map(toProjectResponse);
    const nextCursor = hasNextPage ? encodeCursor(projects[limit - 1]) : null;

    return sendSuccess(res, {
      items,
      nextCursor
    });
  }

  const payload = parseJsonBody(req);
  if (!payload) {
    return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const enrichedPayload = await enrichProjectPayload(payload);

  const details = validateCreateProjectPayload(enrichedPayload);
  if (details.length > 0) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid project payload.', details);
  }

  if (
    (enrichedPayload.status || 'waiting') === 'ongoing' &&
    (!enrichedPayload.geo ||
      typeof enrichedPayload.geo.lat !== 'number' ||
      typeof enrichedPayload.geo.lng !== 'number')
  ) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Project geolocation could not be resolved automatically. Provide geo.lat and geo.lng or use waiting status.'
    );
  }

  if (enrichedPayload.customerId) {
    const customer = await Customer.findById(enrichedPayload.customerId).select('_id isDeleted').exec();
    if (!customer || customer.isDeleted === true) {
      return sendError(res, 404, 'CUSTOMER_NOT_FOUND', 'customerId not found.');
    }
  }

  const createPayload = sanitizeCreateProjectPayload(enrichedPayload);
  if (createPayload.status === 'ongoing') {
    createPayload.actualStartAt = createPayload.actualStartAt || new Date();
    createPayload.actualEndAt = null;
  } else if (createPayload.status === 'finished') {
    createPayload.actualStartAt = createPayload.actualStartAt || new Date();
    createPayload.actualEndAt = new Date();
  } else {
    createPayload.actualStartAt = createPayload.actualStartAt || null;
    createPayload.actualEndAt = createPayload.actualEndAt || null;
  }
  syncProjectActualDurationDays(createPayload);

  const project = await Project.create(createPayload);
  await syncProjectReferralExpense({
    project,
    actorUserId: req.auth.userId
  });
  const createdProject = await Project.findById(project._id)
    .populate('customerId', 'fullName address email phone')
    .exec();
  return sendSuccess(res, toProjectResponse(createdProject), 201);
}

module.exports = withErrorHandling(requireAuth(handler));

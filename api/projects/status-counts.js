const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Project, PROJECT_STATUSES } = require('../../src/models/Project');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  await connectToDatabase();

  const [statusAgg, totalAll] = await Promise.all([
    Project.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]),
    Project.countDocuments({})
  ]);

  const counts = {
    waiting: 0,
    ongoing: 0,
    review: 0,
    finished: 0,
    canceled: 0
  };

  for (const row of statusAgg) {
    if (PROJECT_STATUSES.includes(row._id)) {
      counts[row._id] = Number(row.count || 0);
    }
  }

  return sendSuccess(res, {
    ...counts,
    totalAll: Number(totalAll || 0)
  });
}

module.exports = withErrorHandling(requireAuth(handler));

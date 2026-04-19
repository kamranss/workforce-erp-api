const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { parseReportDateRange, valueOrZero } = require('../../src/helpers/reports');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { TimeEntry } = require('../../src/models/TimeEntry');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  const range = parseReportDateRange(req.query);
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }

  let projectObjectId = null;
  if (req.query.projectId !== undefined) {
    if (!isValidObjectId(req.query.projectId)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'projectId must be a valid ObjectId when provided.');
    }
    projectObjectId = new mongoose.Types.ObjectId(req.query.projectId);
  }

  await connectToDatabase();

  const pipeline = [
    {
      $match: {
        isDeleted: { $ne: true },
        clockOutAt: { $ne: null },
        clockInAt: {
          $gte: range.from,
          $lte: range.to
        }
      }
    },
    {
      $project: {
        userId: 1,
        minutesWorked: { $ifNull: ['$minutesWorked', 0] },
        hourlyRateAtTime: { $ifNull: ['$hourlyRateAtTime', 0] },
        projectRefs: [{ $ifNull: ['$projectIdIn', '$projectId'] }]
      }
    },
    { $unwind: '$projectRefs' },
    { $match: { projectRefs: { $ne: null } } }
  ];

  if (projectObjectId) {
    pipeline.push({ $match: { projectRefs: projectObjectId } });
  }

  pipeline.push(
    {
      $group: {
        _id: {
          projectId: '$projectRefs',
          userId: '$userId'
        },
        laborMinutes: { $sum: '$minutesWorked' },
        laborEarnings: {
          $sum: {
            $multiply: [{ $divide: ['$minutesWorked', 60] }, '$hourlyRateAtTime']
          }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.userId',
        foreignField: '_id',
        as: 'userDoc'
      }
    },
    {
      $unwind: {
        path: '$userDoc',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $group: {
        _id: '$_id.projectId',
        laborMinutes: { $sum: '$laborMinutes' },
        laborEarnings: { $sum: '$laborEarnings' },
        users: {
          $push: {
            userId: '$_id.userId',
            name: '$userDoc.name',
            surname: '$userDoc.surname',
            laborMinutes: '$laborMinutes',
            laborEarnings: '$laborEarnings'
          }
        }
      }
    },
    {
      $lookup: {
        from: 'projects',
        localField: '_id',
        foreignField: '_id',
        as: 'projectDoc'
      }
    },
    {
      $unwind: {
        path: '$projectDoc',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        _id: 0,
        projectId: '$_id',
        projectDescription: '$projectDoc.description',
        projectStatus: '$projectDoc.status',
        laborMinutes: 1,
        laborEarnings: 1,
        users: 1
      }
    },
    { $sort: { projectDescription: 1, projectId: 1 } }
  );

  const rows = await TimeEntry.aggregate(pipeline);

  const items = rows.map((row) => ({
    projectId: String(row.projectId),
    projectDescription: row.projectDescription || null,
    projectStatus: row.projectStatus || null,
    laborMinutes: valueOrZero(row.laborMinutes),
    laborHours: valueOrZero(row.laborMinutes) / 60,
    laborEarnings: valueOrZero(row.laborEarnings),
    users: (row.users || []).map((u) => ({
      userId: String(u.userId),
      name: u.name || null,
      surname: u.surname || null,
      laborMinutes: valueOrZero(u.laborMinutes),
      laborHours: valueOrZero(u.laborMinutes) / 60,
      laborEarnings: valueOrZero(u.laborEarnings)
    }))
  }));

  return sendSuccess(res, {
    range: {
      from: range.from,
      to: range.to
    },
    items
  });
}

module.exports = withErrorHandling(requireAuth(handler));

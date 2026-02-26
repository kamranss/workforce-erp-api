const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { parseReportDateRange, valueOrZero } = require('../../src/helpers/reports');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Expense } = require('../../src/models/Expense');
const { Project } = require('../../src/models/Project');
const { TimeEntry } = require('../../src/models/TimeEntry');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  if (!isValidObjectId(req.query.projectId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'projectId is required and must be a valid ObjectId.');
  }

  const range = parseReportDateRange(req.query);
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }

  await connectToDatabase();

  const projectId = new mongoose.Types.ObjectId(req.query.projectId);
  const project = await Project.findById(projectId)
    .select('_id description status quoteAmount quoteNumber')
    .exec();
  if (!project) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }

  const [laborAgg, expenseAgg] = await Promise.all([
    TimeEntry.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          clockOutAt: { $ne: null },
          clockInAt: {
            $gte: range.from,
            $lte: range.to
          },
          $or: [{ projectIdIn: projectId }, { projectIdOut: projectId }, { projectId }]
        }
      },
      {
        $group: {
          _id: null,
          laborMinutes: { $sum: { $ifNull: ['$minutesWorked', 0] } },
          laborEarnings: {
            $sum: {
              $multiply: [
                { $divide: [{ $ifNull: ['$minutesWorked', 0] }, 60] },
                { $ifNull: ['$hourlyRateAtTime', 0] }
              ]
            }
          }
        }
      }
    ]),
    Expense.aggregate([
      {
        $match: {
          projectId,
          isDeleted: { $ne: true },
          spentAt: {
            $gte: range.from,
            $lte: range.to
          }
        }
      },
      {
        $group: {
          _id: null,
          projectExpenseTotal: {
            $sum: {
              $cond: [{ $eq: ['$scope', 'project'] }, { $ifNull: ['$amount', 0] }, 0]
            }
          },
          companyProjectRelatedExpenseTotal: {
            $sum: {
              $cond: [{ $eq: ['$scope', 'company'] }, { $ifNull: ['$amount', 0] }, 0]
            }
          }
        }
      }
    ])
  ]);

  const laborMinutes = valueOrZero(laborAgg[0]?.laborMinutes);
  const laborEarnings = valueOrZero(laborAgg[0]?.laborEarnings);
  const projectExpenseTotal = valueOrZero(expenseAgg[0]?.projectExpenseTotal);
  const companyProjectRelatedExpenseTotal = valueOrZero(expenseAgg[0]?.companyProjectRelatedExpenseTotal);
  const expenseTotal = projectExpenseTotal;
  const expenseTotalWithCompanyProjectRelated = projectExpenseTotal + companyProjectRelatedExpenseTotal;
  const netCost = laborEarnings + projectExpenseTotal;
  const netCostWithCompanyProjectRelated = laborEarnings + expenseTotalWithCompanyProjectRelated;

  return sendSuccess(res, {
    projectId: String(projectId),
    projectDescription: project.description || null,
    projectStatus: project.status || null,
    projectQuoteAmount: valueOrZero(project.quoteAmount),
    projectQuoteNumber: project.quoteNumber || null,
    range: {
      from: range.from,
      to: range.to
    },
    laborMinutes,
    laborEarnings,
    expenseTotal,
    projectExpenseTotal,
    companyProjectRelatedExpenseTotal,
    expenseTotalWithCompanyProjectRelated,
    netCost,
    netCostWithCompanyProjectRelated
  });
}

module.exports = withErrorHandling(requireAuth(handler));

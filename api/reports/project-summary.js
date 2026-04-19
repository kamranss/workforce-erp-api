const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { parseReportDateRange, valueOrZero } = require('../../src/helpers/reports');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { CustomerPayment } = require('../../src/models/CustomerPayment');
const { Expense } = require('../../src/models/Expense');
const { Project } = require('../../src/models/Project');
const { TimeEntry } = require('../../src/models/TimeEntry');
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function calculateDurationDays(actualStartAt, actualEndAt) {
  if (!actualStartAt || !actualEndAt) {
    return null;
  }

  const startMillis = new Date(actualStartAt).getTime();
  const endMillis = new Date(actualEndAt).getTime();
  if (Number.isNaN(startMillis) || Number.isNaN(endMillis)) {
    return null;
  }

  return Number((Math.max(0, (endMillis - startMillis) / MILLIS_PER_DAY)).toFixed(2));
}

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
    .select('_id description status quoteAmount quoteNumber actualStartAt actualEndAt actualDurationDays')
    .exec();
  if (!project) {
    return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }

  const [laborAgg, expenseAgg, customerPaymentAgg] = await Promise.all([
    TimeEntry.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          clockOutAt: { $ne: null },
          clockInAt: {
            $gte: range.from,
            $lte: range.to
          },
          $or: [{ projectIdIn: projectId }, { projectId }]
        }
      },
      {
        $group: {
          _id: null,
          laborMinutes: { $sum: { $ifNull: ['$minutesWorked', 0] } },
          workers: { $addToSet: '$userId' },
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
          projectMaterialExpenseTotal: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ['$scope', 'project'] }, { $eq: ['$type', 'material'] }]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          },
          companyProjectRelatedExpenseTotal: {
            $sum: {
              $cond: [{ $eq: ['$scope', 'company'] }, { $ifNull: ['$amount', 0] }, 0]
            }
          }
        }
      }
    ]),
    CustomerPayment.aggregate([
      {
        $match: {
          projectId,
          isDeleted: { $ne: true },
          paidAt: {
            $gte: range.from,
            $lte: range.to
          }
        }
      },
      {
        $group: {
          _id: null,
          materialPaidAmount: {
            $sum: {
              $cond: [{ $eq: ['$type', 'material'] }, { $ifNull: ['$amount', 0] }, 0]
            }
          },
          mainWorkPaidAmount: {
            $sum: {
              $cond: [{ $eq: ['$type', 'main_work'] }, { $ifNull: ['$amount', 0] }, 0]
            }
          },
          otherPaidAmount: {
            $sum: {
              $cond: [{ $eq: ['$type', 'other'] }, { $ifNull: ['$amount', 0] }, 0]
            }
          },
          unknownPaidAmount: {
            $sum: {
              $cond: [{ $eq: ['$type', 'unknown'] }, { $ifNull: ['$amount', 0] }, 0]
            }
          }
        }
      }
    ])
  ]);

  const laborMinutes = valueOrZero(laborAgg[0]?.laborMinutes);
  const workersCount = Number((laborAgg[0]?.workers || []).length || 0);
  const laborEarnings = valueOrZero(laborAgg[0]?.laborEarnings);
  const projectDurationDays =
    typeof project.actualDurationDays === 'number'
      ? Number(project.actualDurationDays.toFixed(2))
      : calculateDurationDays(project.actualStartAt, project.actualEndAt);
  const projectExpenseTotal = valueOrZero(expenseAgg[0]?.projectExpenseTotal);
  const projectMaterialExpenseTotal = valueOrZero(expenseAgg[0]?.projectMaterialExpenseTotal);
  const companyProjectRelatedExpenseTotal = valueOrZero(expenseAgg[0]?.companyProjectRelatedExpenseTotal);
  const materialPaidAmount = valueOrZero(customerPaymentAgg[0]?.materialPaidAmount);
  const mainWorkPaidAmount = valueOrZero(customerPaymentAgg[0]?.mainWorkPaidAmount);
  const otherPaidAmount = valueOrZero(customerPaymentAgg[0]?.otherPaidAmount);
  const unknownPaidAmount = valueOrZero(customerPaymentAgg[0]?.unknownPaidAmount);
  const nonMainWorkPaidAmount = materialPaidAmount + otherPaidAmount + unknownPaidAmount;
  const totalPaidAllTypesAmount = mainWorkPaidAmount + nonMainWorkPaidAmount;
  const projectMaterialExpenseNetAfterCustomerPayments =
    projectMaterialExpenseTotal - materialPaidAmount;
  const expenseTotal = projectExpenseTotal;
  const expenseTotalWithCompanyProjectRelated = projectExpenseTotal + companyProjectRelatedExpenseTotal;
  const netCost = laborEarnings + projectExpenseTotal;
  const netCostWithCompanyProjectRelated = laborEarnings + expenseTotalWithCompanyProjectRelated;
  const netCostWithMaterialOffset = netCost - materialPaidAmount;
  const netCostWithCompanyProjectRelatedAndMaterialOffset =
    netCostWithCompanyProjectRelated - materialPaidAmount;

  return sendSuccess(res, {
    projectId: String(projectId),
    projectDescription: project.description || null,
    projectStatus: project.status || null,
    projectQuoteAmount: valueOrZero(project.quoteAmount),
    projectQuoteNumber: project.quoteNumber || null,
    actualStartAt: project.actualStartAt || null,
    actualEndAt: project.actualEndAt || null,
    projectDurationDays,
    workersCount,
    range: {
      from: range.from,
      to: range.to
    },
    laborMinutes,
    laborEarnings,
    expenseTotal,
    projectExpenseTotal,
    projectMaterialExpenseTotal,
    projectMaterialExpenseNetAfterCustomerPayments,
    companyProjectRelatedExpenseTotal,
    expenseTotalWithCompanyProjectRelated,
    netCost,
    netCostWithCompanyProjectRelated,
    netCostWithMaterialOffset,
    netCostWithCompanyProjectRelatedAndMaterialOffset,
    mainWorkPaidAmount,
    materialPaidAmount,
    otherPaidAmount,
    unknownPaidAmount,
    nonMainWorkPaidAmount,
    totalPaidAllTypesAmount
  });
}

module.exports = withErrorHandling(requireAuth(handler));

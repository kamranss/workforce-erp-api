const { connectToDatabase } = require('../../src/db/mongo');
const { getMonthRange } = require('../../src/helpers/dates');
const { withErrorHandling } = require('../../src/helpers/handler');
const { parseReportDateRange, valueOrZero } = require('../../src/helpers/reports');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { CustomerPayment } = require('../../src/models/CustomerPayment');
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

  const range = parseReportDateRange(req.query);
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }
  const companyGeneralCurrentMonthRange = getMonthRange(new Date(), 'America/Chicago');

  await connectToDatabase();

  const [allProjectsAgg, ongoingProjectsAgg, laborAgg, expenseAgg, customerPaymentAgg, companyGeneralMonthlyAgg] = await Promise.all([
    Project.aggregate([
      {
        $group: {
          _id: null,
          totalProjects: { $sum: 1 },
          totalQuoteAmount: { $sum: { $ifNull: ['$quoteAmount', 0] } }
        }
      }
    ]),
    Project.aggregate([
      {
        $match: {
          isActive: true,
          status: 'ongoing'
        }
      },
      {
        $group: {
          _id: null,
          ongoingProjectsCount: { $sum: 1 },
          ongoingQuoteAmount: { $sum: { $ifNull: ['$quoteAmount', 0] } }
        }
      }
    ]),
    TimeEntry.aggregate([
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
          minutesWorked: { $ifNull: ['$minutesWorked', 0] },
          hourlyRateAtTime: { $ifNull: ['$hourlyRateAtTime', 0] },
          projectRefs: [{ $ifNull: ['$projectIdIn', '$projectId'] }]
        }
      },
      { $unwind: '$projectRefs' },
      { $match: { projectRefs: { $ne: null } } },
      {
        $lookup: {
          from: 'projects',
          localField: 'projectRefs',
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
        $group: {
          _id: null,
          totalLaborMinutes: { $sum: '$minutesWorked' },
          totalLaborEarnings: {
            $sum: {
              $multiply: [{ $divide: ['$minutesWorked', 60] }, '$hourlyRateAtTime']
            }
          },
          ongoingLaborMinutes: {
            $sum: {
              $cond: [{ $eq: ['$projectDoc.status', 'ongoing'] }, '$minutesWorked', 0]
            }
          },
          ongoingLaborEarnings: {
            $sum: {
              $cond: [
                { $eq: ['$projectDoc.status', 'ongoing'] },
                { $multiply: [{ $divide: ['$minutesWorked', 60] }, '$hourlyRateAtTime'] },
                0
              ]
            }
          },
          distinctProjects: { $addToSet: '$projectRefs' }
        }
      },
      {
        $project: {
          _id: 0,
          totalLaborMinutes: 1,
          totalLaborEarnings: 1,
          ongoingLaborMinutes: 1,
          ongoingLaborEarnings: 1,
          projectsWithLaborCount: { $size: '$distinctProjects' }
        }
      }
    ])
    ,
    Expense.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          spentAt: {
            $gte: range.from,
            $lte: range.to
          }
        }
      },
      {
        $lookup: {
          from: 'projects',
          localField: 'projectId',
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
        $group: {
          _id: null,
          totalProjectExpenses: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ['$scope', 'project'] }, { $ne: ['$projectId', null] }]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          },
          totalProjectMaterialExpenses: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$scope', 'project'] },
                    { $ne: ['$projectId', null] },
                    { $eq: ['$type', 'material'] }
                  ]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          },
          ongoingProjectExpenses: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$scope', 'project'] },
                    { $ne: ['$projectId', null] },
                    { $eq: ['$projectDoc.status', 'ongoing'] }
                  ]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          },
          ongoingProjectMaterialExpenses: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$scope', 'project'] },
                    { $ne: ['$projectId', null] },
                    { $eq: ['$type', 'material'] },
                    { $eq: ['$projectDoc.status', 'ongoing'] }
                  ]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          },
          totalCompanyProjectRelatedExpenses: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ['$scope', 'company'] }, { $ne: ['$projectId', null] }]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          },
          ongoingCompanyProjectRelatedExpenses: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$scope', 'company'] },
                    { $ne: ['$projectId', null] },
                    { $eq: ['$projectDoc.status', 'ongoing'] }
                  ]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          },
          totalCompanyGeneralExpenses: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ['$scope', 'company'] }, { $eq: ['$projectId', null] }]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          }
        }
      }
    ]),
    CustomerPayment.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          projectId: { $ne: null },
          paidAt: {
            $gte: range.from,
            $lte: range.to
          }
        }
      },
      {
        $lookup: {
          from: 'projects',
          localField: 'projectId',
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
        $group: {
          _id: null,
          totalMaterialPaidByCustomers: {
            $sum: {
              $cond: [{ $eq: ['$type', 'material'] }, { $ifNull: ['$amount', 0] }, 0]
            }
          },
          ongoingMaterialPaidByCustomers: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$type', 'material'] },
                    { $eq: ['$projectDoc.status', 'ongoing'] },
                    { $eq: ['$projectDoc.isActive', true] }
                  ]
                },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          }
        }
      }
    ]),
    Expense.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          scope: 'company',
          projectId: null,
          spentAt: {
            $gte: companyGeneralCurrentMonthRange.from,
            $lte: companyGeneralCurrentMonthRange.to
          }
        }
      },
      {
        $group: {
          _id: null,
          companyGeneralExpensesCurrentMonth: { $sum: { $ifNull: ['$amount', 0] } }
        }
      }
    ])
  ]);

  const allProjects = allProjectsAgg[0] || {};
  const ongoingProjects = ongoingProjectsAgg[0] || {};
  const labor = laborAgg[0] || {};
  const expenses = expenseAgg[0] || {};
  const customerPayments = customerPaymentAgg[0] || {};
  const companyGeneralMonthly = companyGeneralMonthlyAgg[0] || {};

  const totalQuoteAmount = valueOrZero(allProjects.totalQuoteAmount);
  const ongoingQuoteAmount = valueOrZero(ongoingProjects.ongoingQuoteAmount);
  const totalLaborMinutes = valueOrZero(labor.totalLaborMinutes);
  const ongoingLaborMinutes = valueOrZero(labor.ongoingLaborMinutes);
  const totalLaborEarnings = valueOrZero(labor.totalLaborEarnings);
  const ongoingLaborEarnings = valueOrZero(labor.ongoingLaborEarnings);
  const totalProjectExpenses = valueOrZero(expenses.totalProjectExpenses);
  const totalProjectMaterialExpenses = valueOrZero(expenses.totalProjectMaterialExpenses);
  const ongoingProjectExpenses = valueOrZero(expenses.ongoingProjectExpenses);
  const ongoingProjectMaterialExpenses = valueOrZero(expenses.ongoingProjectMaterialExpenses);
  const totalCompanyProjectRelatedExpenses = valueOrZero(expenses.totalCompanyProjectRelatedExpenses);
  const ongoingCompanyProjectRelatedExpenses = valueOrZero(expenses.ongoingCompanyProjectRelatedExpenses);
  const totalCompanyGeneralExpenses = valueOrZero(expenses.totalCompanyGeneralExpenses);
  const ongoingCompanyGeneralExpenses = totalCompanyGeneralExpenses;
  const ongoingCompanyGeneralExpensesCurrentMonth = valueOrZero(
    companyGeneralMonthly.companyGeneralExpensesCurrentMonth
  );
  const totalMaterialPaidByCustomers = valueOrZero(customerPayments.totalMaterialPaidByCustomers);
  const ongoingMaterialPaidByCustomers = valueOrZero(customerPayments.ongoingMaterialPaidByCustomers);
  const totalProjectMaterialExpensesNet = totalProjectMaterialExpenses - totalMaterialPaidByCustomers;
  const ongoingProjectMaterialExpensesNet =
    ongoingProjectMaterialExpenses - ongoingMaterialPaidByCustomers;
  const totalExpenses = totalProjectExpenses;
  const ongoingExpenses = ongoingProjectExpenses;
  const totalConsumed = totalLaborEarnings + totalProjectExpenses;
  const ongoingConsumed = ongoingLaborEarnings + ongoingProjectExpenses;
  const totalConsumedWithCompanyProjectRelated = totalConsumed + totalCompanyProjectRelatedExpenses;
  const ongoingConsumedWithCompanyProjectRelated = ongoingConsumed + ongoingCompanyProjectRelatedExpenses;
  const totalConsumedWithAllCompanyExpenses =
    totalConsumedWithCompanyProjectRelated + totalCompanyGeneralExpenses;
  const ongoingConsumedWithAllCompanyExpenses =
    ongoingConsumedWithCompanyProjectRelated + ongoingCompanyGeneralExpenses;
  const totalConsumedWithAllCompanyExpensesAndMaterialOffset =
    totalConsumedWithAllCompanyExpenses - totalMaterialPaidByCustomers;
  const ongoingConsumedWithAllCompanyExpensesAndMaterialOffset =
    ongoingConsumedWithAllCompanyExpenses - ongoingMaterialPaidByCustomers;
  const totalRemainingFromQuote = totalQuoteAmount - totalConsumed;
  const ongoingRemainingFromQuote = ongoingQuoteAmount - ongoingConsumed;
  const totalRemainingFromQuoteWithCompanyProjectRelated =
    totalQuoteAmount - totalConsumedWithCompanyProjectRelated;
  const ongoingRemainingFromQuoteWithCompanyProjectRelated =
    ongoingQuoteAmount - ongoingConsumedWithCompanyProjectRelated;
  const totalRemainingFromQuoteWithAllCompanyExpenses =
    totalQuoteAmount - totalConsumedWithAllCompanyExpenses;
  const ongoingRemainingFromQuoteWithAllCompanyExpenses =
    ongoingQuoteAmount - ongoingConsumedWithAllCompanyExpenses;
  const totalRemainingFromQuoteWithAllCompanyExpensesAndMaterialOffset =
    totalQuoteAmount - totalConsumedWithAllCompanyExpensesAndMaterialOffset;
  const ongoingRemainingFromQuoteWithAllCompanyExpensesAndMaterialOffset =
    ongoingQuoteAmount - ongoingConsumedWithAllCompanyExpensesAndMaterialOffset;

  return sendSuccess(res, {
    range: {
      from: range.from,
      to: range.to,
      companyGeneralCurrentMonthFrom: companyGeneralCurrentMonthRange.from,
      companyGeneralCurrentMonthTo: companyGeneralCurrentMonthRange.to
    },
    totals: {
      totalProjects: Number(allProjects.totalProjects || 0),
      ongoingProjectsCount: Number(ongoingProjects.ongoingProjectsCount || 0),
      projectsWithLaborCount: Number(labor.projectsWithLaborCount || 0),
      totalQuoteAmount,
      ongoingQuoteAmount,
      totalLaborMinutes,
      totalLaborHours: Number((totalLaborMinutes / 60).toFixed(2)),
      totalLaborEarnings,
      ongoingLaborMinutes,
      ongoingLaborHours: Number((ongoingLaborMinutes / 60).toFixed(2)),
      ongoingLaborEarnings,
      totalExpenses,
      ongoingExpenses,
      totalProjectExpenses,
      totalProjectMaterialExpenses,
      totalProjectMaterialExpensesNet,
      ongoingProjectExpenses,
      ongoingProjectMaterialExpenses,
      ongoingProjectMaterialExpensesNet,
      totalMaterialPaidByCustomers,
      ongoingMaterialPaidByCustomers,
      totalCompanyProjectRelatedExpenses,
      ongoingCompanyProjectRelatedExpenses,
      totalCompanyGeneralExpenses,
      ongoingCompanyGeneralExpenses,
      ongoingCompanyGeneralExpensesCurrentMonth,
      totalConsumed,
      ongoingConsumed,
      totalConsumedWithCompanyProjectRelated,
      ongoingConsumedWithCompanyProjectRelated,
      totalConsumedWithAllCompanyExpenses,
      ongoingConsumedWithAllCompanyExpenses,
      totalConsumedWithAllCompanyExpensesAndMaterialOffset,
      ongoingConsumedWithAllCompanyExpensesAndMaterialOffset,
      totalRemainingFromQuote,
      ongoingRemainingFromQuote,
      totalRemainingFromQuoteWithCompanyProjectRelated,
      ongoingRemainingFromQuoteWithCompanyProjectRelated,
      totalRemainingFromQuoteWithAllCompanyExpenses,
      ongoingRemainingFromQuoteWithAllCompanyExpenses,
      totalRemainingFromQuoteWithAllCompanyExpensesAndMaterialOffset,
      ongoingRemainingFromQuoteWithAllCompanyExpensesAndMaterialOffset
    }
  });
}

module.exports = withErrorHandling(requireAuth(handler));

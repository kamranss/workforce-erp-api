const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const {
  getMonthRangeForYearMonth,
  getQuarterRange,
  getYearRange
} = require('../../src/helpers/dates');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Expense } = require('../../src/models/Expense');
const { TimeEntry } = require('../../src/models/TimeEntry');
const { User } = require('../../src/models/User');

const REPORT_TIME_ZONE = 'America/Chicago';

function parseIntegerQuery(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function roundMoney(value) {
  return Number((value || 0).toFixed(2));
}

function roundHoursFromMinutes(minutes) {
  return Number(((minutes || 0) / 60).toFixed(2));
}

function buildLabelFromName(name, surname) {
  return [name, surname].filter(Boolean).join(' ').trim() || 'Unknown User';
}

function formatCategoryLabel(category) {
  return String(category || 'unknown')
    .split('_')
    .join(' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseCompanyExpensesRange(query) {
  const now = new Date();
  const currentYear = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: REPORT_TIME_ZONE,
      year: 'numeric'
    }).format(now)
  );

  const year = parseIntegerQuery(query.year) ?? currentYear;
  const month = parseIntegerQuery(query.month);
  const quarter = parseIntegerQuery(query.quarter);

  if (year < 2000 || year > 2100) {
    return { error: 'year must be between 2000 and 2100.' };
  }

  if (month !== null && (month < 1 || month > 12)) {
    return { error: 'month must be between 1 and 12 when provided.' };
  }

  if (quarter !== null && (quarter < 1 || quarter > 4)) {
    return { error: 'quarter must be between 1 and 4 when provided.' };
  }

  if (month !== null && quarter !== null) {
    return { error: 'month and quarter cannot be provided together.' };
  }

  if (month !== null) {
    const range = getMonthRangeForYearMonth(year, month, REPORT_TIME_ZONE);
    return {
      year,
      month,
      quarter: null,
      from: range.from,
      to: range.to,
      label: range.label
    };
  }

  if (quarter !== null) {
    const range = getQuarterRange(year, quarter, REPORT_TIME_ZONE);
    return {
      year,
      month: null,
      quarter,
      from: range.from,
      to: range.to,
      label: range.label
    };
  }

  const range = getYearRange(year, REPORT_TIME_ZONE);
  return {
    year,
    month: null,
    quarter: null,
    from: range.from,
    to: range.to,
    label: range.label
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  const range = parseCompanyExpensesRange(req.query);
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }

  await connectToDatabase();

  const [laborAgg, expenseAgg, expenseItems] = await Promise.all([
    TimeEntry.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          clockOutAt: {
            $ne: null,
            $gte: range.from,
            $lte: range.to
          }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalMinutesWorked: { $sum: { $ifNull: ['$minutesWorked', 0] } },
          totalLaborAmount: {
            $sum: {
              $multiply: [
                { $divide: [{ $ifNull: ['$minutesWorked', 0] }, 60] },
                { $ifNull: ['$hourlyRateAtTime', 0] }
              ]
            }
          },
          entriesCount: { $sum: 1 }
        }
      },
      {
        $sort: {
          totalLaborAmount: -1,
          _id: 1
        }
      }
    ]),
    Expense.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          scope: 'company',
          spentAt: {
            $gte: range.from,
            $lte: range.to
          }
        }
      },
      {
        $group: {
          _id: null,
          totalOtherCompanyExpenses: { $sum: { $ifNull: ['$amount', 0] } },
          expenseItemsCount: { $sum: 1 },
          companyGeneralAmount: {
            $sum: {
              $cond: [{ $eq: ['$projectId', null] }, { $ifNull: ['$amount', 0] }, 0]
            }
          },
          companyGeneralCount: {
            $sum: {
              $cond: [{ $eq: ['$projectId', null] }, 1, 0]
            }
          },
          companyProjectRelatedAmount: {
            $sum: {
              $cond: [{ $ne: ['$projectId', null] }, { $ifNull: ['$amount', 0] }, 0]
            }
          },
          companyProjectRelatedCount: {
            $sum: {
              $cond: [{ $ne: ['$projectId', null] }, 1, 0]
            }
          }
        }
      }
    ]),
    Expense.find({
      isDeleted: { $ne: true },
      scope: 'company',
      spentAt: {
        $gte: range.from,
        $lte: range.to
      }
    })
      .select('type amount')
      .lean()
      .sort({ spentAt: -1, _id: -1 })
      .exec()
  ]);

  const laborUserIds = laborAgg
    .map((row) => row._id)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const users = laborUserIds.length
    ? await User.find({ _id: { $in: laborUserIds } }).select('name surname').exec()
    : [];
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const totalLaborCostRaw = laborAgg.reduce(
    (sum, row) => sum + (Number(row.totalLaborAmount) || 0),
    0
  );
  const totalOtherExpensesRaw = Number(expenseAgg[0]?.totalOtherCompanyExpenses) || 0;

  const laborBreakdown = laborAgg.map((row) => {
    const userDoc = userMap.get(String(row._id));
    const amount = roundMoney(Number(row.totalLaborAmount) || 0);
    const minutesWorked = Number(row.totalMinutesWorked) || 0;

    return {
      userId: String(row._id),
      name: buildLabelFromName(userDoc?.name, userDoc?.surname),
      amount,
      minutesWorked,
      hoursWorked: roundHoursFromMinutes(minutesWorked),
      entriesCount: Number(row.entriesCount || 0),
      percentage:
        totalLaborCostRaw > 0 ? Number(((amount / totalLaborCostRaw) * 100).toFixed(2)) : 0
    };
  });

  const expenseByCategory = new Map();
  for (const item of expenseItems) {
    const key = item.type || 'unknown';
    const current = expenseByCategory.get(key) || { amount: 0, count: 0 };
    current.amount += Number(item.amount) || 0;
    current.count += 1;
    expenseByCategory.set(key, current);
  }

  const expenseCategoryBreakdown = [...expenseByCategory.entries()]
    .map(([category, data]) => {
      const amount = roundMoney(data.amount);
      return {
        category,
        label: formatCategoryLabel(category),
        amount,
        count: data.count,
        percentage:
          totalOtherExpensesRaw > 0
            ? Number(((amount / totalOtherExpensesRaw) * 100).toFixed(2))
            : 0
      };
    })
    .sort((a, b) => {
      if (b.amount !== a.amount) {
        return b.amount - a.amount;
      }
      return a.label.localeCompare(b.label);
    });

  const totalLaborCost = roundMoney(totalLaborCostRaw);
  const totalOtherCompanyExpenses = roundMoney(totalOtherExpensesRaw);

  return sendSuccess(res, {
    range: {
      year: range.year,
      month: range.month,
      quarter: range.quarter,
      from: range.from,
      to: range.to,
      label: range.label,
      timeZone: REPORT_TIME_ZONE
    },
    summary: {
      totalLaborCost,
      totalOtherCompanyExpenses,
      totalCombinedCost: roundMoney(totalLaborCost + totalOtherCompanyExpenses),
      laborWorkersCount: laborBreakdown.length,
      expenseItemsCount: Number(expenseAgg[0]?.expenseItemsCount || 0)
    },
    laborBreakdown,
    expenseCategoryBreakdown,
    expenseScopeBreakdown: {
      companyGeneral: {
        amount: roundMoney(Number(expenseAgg[0]?.companyGeneralAmount) || 0),
        count: Number(expenseAgg[0]?.companyGeneralCount || 0)
      },
      companyProjectRelated: {
        amount: roundMoney(Number(expenseAgg[0]?.companyProjectRelatedAmount) || 0),
        count: Number(expenseAgg[0]?.companyProjectRelatedCount || 0)
      }
    }
  });
}

module.exports = withErrorHandling(requireAuth(handler));

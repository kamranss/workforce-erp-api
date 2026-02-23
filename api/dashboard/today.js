const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { getChicagoDayRange } = require('../../src/helpers/dates');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { BonusAndPenalty } = require('../../src/models/BonusAndPenalty');
const { Expense } = require('../../src/models/Expense');
const { Payment } = require('../../src/models/Payment');
const { Task } = require('../../src/models/Task');
const { TimeEntry } = require('../../src/models/TimeEntry');

function valueOrZero(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access dashboard endpoints.');
  }

  await connectToDatabase();
  const today = getChicagoDayRange();

  const [
    openEntriesCount,
    checkInsTodayCount,
    checkOutsTodayCount,
    laborAgg,
    bonusAgg,
    paymentAgg,
    expenseAgg,
    tasksDueTodayCount,
    tasksOpenCount
  ] =
    await Promise.all([
      TimeEntry.countDocuments({
        isDeleted: { $ne: true },
        clockOutAt: null
      }),
      TimeEntry.countDocuments({
        isDeleted: { $ne: true },
        clockInAt: { $gte: today.from, $lte: today.to }
      }),
      TimeEntry.countDocuments({
        isDeleted: { $ne: true },
        clockOutAt: { $gte: today.from, $lte: today.to }
      }),
      TimeEntry.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },
            clockOutAt: { $ne: null },
            clockInAt: { $gte: today.from, $lte: today.to }
          }
        },
        {
          $group: {
            _id: null,
            laborMinutesToday: { $sum: { $ifNull: ['$minutesWorked', 0] } },
            laborEarningsToday: {
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
      BonusAndPenalty.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },
            effectiveAt: { $gte: today.from, $lte: today.to }
          }
        },
        {
          $group: {
            _id: null,
            bonusPenaltyTodayTotal: { $sum: '$amount' }
          }
        }
      ]),
      Payment.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },
            paidAt: { $gte: today.from, $lte: today.to }
          }
        },
        {
          $group: {
            _id: null,
            paymentsTodayTotal: { $sum: '$amount' }
          }
        }
      ]),
      Expense.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },
            spentAt: { $gte: today.from, $lte: today.to }
          }
        },
        {
          $group: {
            _id: null,
            expensesTodayTotal: { $sum: '$amount' }
          }
        }
      ])
      ,
      Task.countDocuments({
        isDeleted: { $ne: true },
        dueDate: { $gte: today.from, $lte: today.to }
      }),
      Task.countDocuments({
        isDeleted: { $ne: true },
        status: { $ne: 'done' }
      })
    ]);

  return sendSuccess(res, {
    dateKey: today.dateKey,
    openEntriesCount,
    checkInsTodayCount,
    checkOutsTodayCount,
    laborMinutesToday: valueOrZero(laborAgg[0]?.laborMinutesToday),
    laborEarningsToday: valueOrZero(laborAgg[0]?.laborEarningsToday),
    bonusPenaltyTodayTotal: valueOrZero(bonusAgg[0]?.bonusPenaltyTodayTotal),
    paymentsTodayTotal: valueOrZero(paymentAgg[0]?.paymentsTodayTotal),
    expensesTodayTotal: valueOrZero(expenseAgg[0]?.expensesTodayTotal),
    tasksDueTodayCount,
    tasksOpenCount
  });
}

module.exports = withErrorHandling(requireAuth(handler));

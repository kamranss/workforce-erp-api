const mongoose = require('mongoose');
const { BonusAndPenalty } = require('../models/BonusAndPenalty');
const { Payment } = require('../models/Payment');
const { TimeEntry } = require('../models/TimeEntry');
const { valueOrZero } = require('./reports');

async function getUserFinancialSummary({ userId, from, to }) {
  const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  const [laborAgg, bonusPenaltyAgg, paymentsAgg] = await Promise.all([
    TimeEntry.aggregate([
      {
        $match: {
          userId: userObjectId,
          isDeleted: { $ne: true },
          clockOutAt: { $ne: null },
          clockInAt: {
            $gte: from,
            $lte: to
          }
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
    BonusAndPenalty.aggregate([
      {
        $match: {
          userId: userObjectId,
          isDeleted: { $ne: true },
          effectiveAt: {
            $gte: from,
            $lte: to
          }
        }
      },
      {
        $group: {
          _id: null,
          bonusPenaltyTotal: { $sum: '$amount' }
        }
      }
    ]),
    Payment.aggregate([
      {
        $match: {
          userId: userObjectId,
          isDeleted: { $ne: true },
          paidAt: {
            $gte: from,
            $lte: to
          }
        }
      },
      {
        $group: {
          _id: null,
          paymentsTotal: { $sum: '$amount' }
        }
      }
    ])
  ]);

  const laborMinutes = valueOrZero(laborAgg[0]?.laborMinutes);
  const laborEarnings = valueOrZero(laborAgg[0]?.laborEarnings);
  const bonusPenaltyTotal = valueOrZero(bonusPenaltyAgg[0]?.bonusPenaltyTotal);
  const paymentsTotal = valueOrZero(paymentsAgg[0]?.paymentsTotal);
  const pendingTotal = laborEarnings + bonusPenaltyTotal - paymentsTotal;

  return {
    laborMinutes,
    laborEarnings,
    bonusPenaltyTotal,
    paymentsTotal,
    pendingTotal
  };
}

module.exports = {
  getUserFinancialSummary
};

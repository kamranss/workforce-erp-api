const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { toBonusAndPenaltyResponse } = require('../../src/helpers/bonusAndPenalties');
const { withErrorHandling } = require('../../src/helpers/handler');
const { toPaymentResponse } = require('../../src/helpers/payments');
const { valueOrZero } = require('../../src/helpers/reports');
const { ROLE_USER } = require('../../src/helpers/roles');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { BonusAndPenalty } = require('../../src/models/BonusAndPenalty');
const { Payment } = require('../../src/models/Payment');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (req.auth.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Only user role can access /api/reports/me.');
  }

  const limit = parseLimit(req.query.limit, 30, 100);
  const paymentsCursor = decodeCursor(req.query.paymentsCursor);
  const bonusCursor = decodeCursor(req.query.bonusCursor);
  if (req.query.paymentsCursor && !paymentsCursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'paymentsCursor is invalid.');
  }
  if (req.query.bonusCursor && !bonusCursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'bonusCursor is invalid.');
  }

  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from && Number.isNaN(from.getTime())) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'from must be a valid ISO date.');
  }
  if (to && Number.isNaN(to.getTime())) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'to must be a valid ISO date.');
  }
  if (from && to && from.getTime() > to.getTime()) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'from must be less than or equal to to.');
  }

  await connectToDatabase();
  const userId = new mongoose.Types.ObjectId(req.auth.userId);

  const bonusMatch = {
    userId,
    isDeleted: { $ne: true }
  };
  const paymentMatch = {
    userId,
    isDeleted: { $ne: true }
  };
  if (from || to) {
    bonusMatch.effectiveAt = {};
    paymentMatch.paidAt = {};
    if (from) {
      bonusMatch.effectiveAt.$gte = from;
      paymentMatch.paidAt.$gte = from;
    }
    if (to) {
      bonusMatch.effectiveAt.$lte = to;
      paymentMatch.paidAt.$lte = to;
    }
  }

  const bonusListQuery = { ...bonusMatch };
  if (bonusCursor) {
    bonusListQuery.$and = [
      ...(bonusListQuery.$and || []),
      {
        $or: [
          { createdAt: { $lt: bonusCursor.createdAt } },
          {
            createdAt: bonusCursor.createdAt,
            _id: { $lt: new mongoose.Types.ObjectId(bonusCursor.id) }
          }
        ]
      }
    ];
  }

  const paymentListQuery = { ...paymentMatch };
  if (paymentsCursor) {
    paymentListQuery.$and = [
      ...(paymentListQuery.$and || []),
      {
        $or: [
          { createdAt: { $lt: paymentsCursor.createdAt } },
          {
            createdAt: paymentsCursor.createdAt,
            _id: { $lt: new mongoose.Types.ObjectId(paymentsCursor.id) }
          }
        ]
      }
    ];
  }

  const [bonusAgg, paymentsAgg, bonusDocs, paymentDocs] = await Promise.all([
    BonusAndPenalty.aggregate([
      { $match: bonusMatch },
      {
        $group: {
          _id: null,
          bonusPenaltyTotal: { $sum: '$amount' }
        }
      }
    ]),
    Payment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: null,
          paymentsTotal: { $sum: '$amount' }
        }
      }
    ]),
    BonusAndPenalty.find(bonusListQuery)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec(),
    Payment.find(paymentListQuery)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec()
  ]);

  const hasNextBonusPage = bonusDocs.length > limit;
  const bonusItems = hasNextBonusPage ? bonusDocs.slice(0, limit) : bonusDocs;
  const hasNextPaymentPage = paymentDocs.length > limit;
  const paymentItems = hasNextPaymentPage ? paymentDocs.slice(0, limit) : paymentDocs;

  return sendSuccess(res, {
    userId: String(userId),
    range: {
      from,
      to
    },
    bonusPenaltyTotal: valueOrZero(bonusAgg[0]?.bonusPenaltyTotal),
    paymentsTotal: valueOrZero(paymentsAgg[0]?.paymentsTotal),
    bonusAndPenalties: {
      items: bonusItems.map(toBonusAndPenaltyResponse),
      nextCursor: hasNextBonusPage ? encodeCursor(bonusDocs[limit - 1]) : null
    },
    payments: {
      items: paymentItems.map(toPaymentResponse),
      nextCursor: hasNextPaymentPage ? encodeCursor(paymentDocs[limit - 1]) : null
    }
  });
}

module.exports = withErrorHandling(requireAuth(handler));

const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { toTimeEntryResponse } = require('../../src/helpers/timeEntries');
const { withErrorHandling } = require('../../src/helpers/handler');
const { valueOrZero } = require('../../src/helpers/reports');
const { ROLE_USER } = require('../../src/helpers/roles');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { BonusAndPenalty } = require('../../src/models/BonusAndPenalty');
const { Payment } = require('../../src/models/Payment');
const { TimeEntry } = require('../../src/models/TimeEntry');
require('../../src/models/Project');

function toUserHoursResponse(entry) {
  const row = toTimeEntryResponse(entry);
  delete row.geoIn;
  delete row.geoOut;
  return row;
}

function getChicagoCurrentYear() {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric'
    }).format(new Date())
  );
}

function parseYearRange(yearValue) {
  const defaultYear = getChicagoCurrentYear();
  const year = yearValue === undefined ? defaultYear : Number.parseInt(String(yearValue), 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: 'year must be a valid 4-digit value between 2000 and 2100.' };
  }

  // Chicago local boundaries for the selected year.
  const from = new Date(`${year}-01-01T00:00:00.000-06:00`);
  const to = new Date(`${year}-12-31T23:59:59.999-06:00`);

  return { year, from, to };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (req.auth.role !== ROLE_USER) {
    return sendError(res, 403, 'FORBIDDEN', 'Only user role can access /api/reports/me-earnings.');
  }

  const range = parseYearRange(req.query.year);
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }

  const limit = parseLimit(req.query.limit, 30, 100);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  await connectToDatabase();
  const userId = new mongoose.Types.ObjectId(req.auth.userId);

  const baseQuery = {
    userId,
    isDeleted: { $ne: true },
    clockOutAt: { $ne: null },
    clockInAt: {
      $gte: range.from,
      $lte: range.to
    }
  };

  const pagedQuery = { ...baseQuery };
  if (cursor) {
    pagedQuery.$and = [
      ...(pagedQuery.$and || []),
      {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            _id: { $lt: new mongoose.Types.ObjectId(cursor.id) }
          }
        ]
      }
    ];
  }

  const [docs, laborAgg, bonusAgg, paymentsAgg] = await Promise.all([
    TimeEntry.find(pagedQuery)
      .populate('projectIdIn', 'description locationKey address')
      .populate('projectIdOut', 'description locationKey address')
      .populate('projectId', 'description locationKey address')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec(),
    TimeEntry.aggregate([
      { $match: baseQuery },
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
          userId,
          isDeleted: { $ne: true },
          effectiveAt: {
            $gte: range.from,
            $lte: range.to
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
          userId,
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
          paymentsTotal: { $sum: '$amount' }
        }
      }
    ])
  ]);

  const hasNextPage = docs.length > limit;
  const pageItems = hasNextPage ? docs.slice(0, limit) : docs;

  const laborMinutes = valueOrZero(laborAgg[0]?.laborMinutes);
  const laborEarnings = valueOrZero(laborAgg[0]?.laborEarnings);
  const bonusPenaltyTotal = valueOrZero(bonusAgg[0]?.bonusPenaltyTotal);
  const paymentsTotal = valueOrZero(paymentsAgg[0]?.paymentsTotal);
  const pendingTotal = laborEarnings + bonusPenaltyTotal - paymentsTotal;

  return sendSuccess(res, {
    userId: String(userId),
    year: range.year,
    range: {
      from: range.from,
      to: range.to
    },
    laborMinutes,
    laborHours: Number((laborMinutes / 60).toFixed(2)),
    laborEarnings: Number(laborEarnings.toFixed(2)),
    bonusPenaltyTotal: Number(bonusPenaltyTotal.toFixed(2)),
    paymentsTotal: Number(paymentsTotal.toFixed(2)),
    pendingTotal: Number(pendingTotal.toFixed(2)),
    items: pageItems.map(toUserHoursResponse),
    nextCursor: hasNextPage ? encodeCursor(docs[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

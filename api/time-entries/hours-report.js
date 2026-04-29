const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { parseHoursRange } = require('../../src/helpers/dates');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const {
  isValidObjectId,
  toTimeEntryResponse,
  getLocalDateKey
} = require('../../src/helpers/timeEntries');
const { toSignedAmount } = require('../../src/helpers/bonusPenaltyMath');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { BonusAndPenalty } = require('../../src/models/BonusAndPenalty');
const { TimeEntry } = require('../../src/models/TimeEntry');
require('../../src/models/Project');
require('../../src/models/User');

function mapHoursItem(entry) {
  const row = toTimeEntryResponse(entry);
  delete row.geoIn;
  delete row.geoOut;
  return row;
}

function toRoundedMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  const range = parseHoursRange(req.query, 'America/Chicago');
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }

  const limit = parseLimit(req.query.limit, 30, 100);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  const adminOrSuperAdmin = isAdminOrSuperAdmin(req.auth.role);
  let scopedUserId = null;
  const baseQuery = {
    isDeleted: { $ne: true },
    clockOutAt: { $ne: null },
    clockInAt: {
      $gte: range.from,
      $lte: range.to
    }
  };

  if (adminOrSuperAdmin) {
    if (req.query.userId !== undefined) {
      if (!isValidObjectId(req.query.userId)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'userId must be a valid ObjectId.');
      }
      scopedUserId = new mongoose.Types.ObjectId(req.query.userId);
    }
  } else if (req.query.userId !== undefined && req.query.userId !== req.auth.userId) {
    return sendError(res, 403, 'FORBIDDEN', 'Users can only access their own hours.');
  } else {
    scopedUserId = new mongoose.Types.ObjectId(req.auth.userId);
  }

  if (scopedUserId) {
    baseQuery.userId = scopedUserId;
  }

  const pagedQuery = { ...baseQuery };
  if (cursor) {
    const cursorCondition = {
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ]
    };
    pagedQuery.$and = [...(pagedQuery.$and || []), cursorCondition];
  }

  await connectToDatabase();

  const [docs, totalsAgg, bonusDocs, lastEntryByDayRows] = await Promise.all([
    TimeEntry.find(pagedQuery)
      .populate('projectIdIn', 'description locationKey address')
      .populate('projectIdOut', 'description locationKey address')
      .populate('projectId', 'description locationKey address')
      .populate('userId', 'name surname email role')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec(),
    TimeEntry.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalMinutes: { $sum: { $ifNull: ['$minutesWorked', 0] } },
          totalEarned: {
            $sum: {
              $multiply: [
                { $divide: [{ $ifNull: ['$minutesWorked', 0] }, 60] },
                { $ifNull: ['$hourlyRateAtTime', 0] }
              ]
            }
          },
          totalEntries: { $sum: 1 }
        }
      }
    ]),
    BonusAndPenalty.find({
      ...(baseQuery.userId ? { userId: baseQuery.userId } : {}),
      isDeleted: { $ne: true },
      effectiveAt: {
        $gte: range.from,
        $lte: range.to
      }
    })
      .select('userId amount type effectiveAt description')
      .populate('userId', 'name surname')
      .lean()
      .exec(),
    TimeEntry.aggregate([
      {
        $match: baseQuery
      },
      {
        $addFields: {
          localDateKey: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$clockInAt',
              timezone: 'America/Chicago'
            }
          }
        }
      },
      {
        $sort: {
          clockOutAt: -1,
          _id: -1
        }
      },
      {
        $group: {
          _id: {
            userId: '$userId',
            localDateKey: '$localDateKey'
          },
          targetEntryId: { $first: '$_id' }
        }
      }
    ])
  ]);

  const hasNextPage = docs.length > limit;
  const pageItems = hasNextPage ? docs.slice(0, limit) : docs;
  const totals = totalsAgg[0] || { totalMinutes: 0, totalEarned: 0, totalEntries: 0 };

  const adjustmentByUserDay = new Map();
  for (const item of bonusDocs) {
    const rawUserId =
      item.userId && typeof item.userId === 'object' && item.userId._id ? item.userId._id : item.userId;
    const userId = String(rawUserId);
    const dateKey = getLocalDateKey(new Date(item.effectiveAt), 'America/Chicago');
    const key = `${userId}::${dateKey}`;
    const current = adjustmentByUserDay.get(key) || {
      userId,
      dateKey,
      bonusAmount: 0,
      penaltyAmount: 0,
      netAdjustment: 0
    };

    const signedAmount = toSignedAmount(item.amount, item.type);
    if (signedAmount >= 0) {
      current.bonusAmount += signedAmount;
    } else {
      current.penaltyAmount += Math.abs(signedAmount);
    }
    current.netAdjustment += signedAmount;
    adjustmentByUserDay.set(key, current);
  }

  const targetEntryIdByUserDay = new Map(
    lastEntryByDayRows.map((row) => [
      `${String(row._id.userId)}::${row._id.localDateKey}`,
      String(row.targetEntryId)
    ])
  );

  const pageItemsMapped = pageItems.map((entry) => {
    const row = mapHoursItem(entry);
    const dateKey = getLocalDateKey(new Date(entry.clockInAt), 'America/Chicago');
    const key = `${String(entry.userId && entry.userId._id ? entry.userId._id : entry.userId)}::${dateKey}`;
    const adjustment = adjustmentByUserDay.get(key);
    const isTargetEntry = targetEntryIdByUserDay.get(key) === String(entry._id);

    const bonusAmount = adjustment && isTargetEntry ? toRoundedMoney(adjustment.bonusAmount) : 0;
    const penaltyAmount = adjustment && isTargetEntry ? toRoundedMoney(adjustment.penaltyAmount) : 0;
    const netAdjustment = adjustment && isTargetEntry ? toRoundedMoney(adjustment.netAdjustment) : 0;

    return {
      ...row,
      bonusAmount,
      penaltyAmount,
      netAdjustment,
      earnedWithAdjustment:
        row.earnedAmount === null
          ? null
          : toRoundedMoney(Number(row.earnedAmount || 0) + netAdjustment)
    };
  });

  const pageEntryIdSet = new Set(pageItems.map((entry) => String(entry._id)));
  const syntheticAdjustmentItems = [];
  for (const item of bonusDocs) {
    const rawUserId =
      item.userId && typeof item.userId === 'object' && item.userId._id ? item.userId._id : item.userId;
    const userId = String(rawUserId);
    const dateKey = getLocalDateKey(new Date(item.effectiveAt), 'America/Chicago');
    const key = `${userId}::${dateKey}`;
    const targetEntryId = targetEntryIdByUserDay.get(key);
    if (targetEntryId && pageEntryIdSet.has(targetEntryId)) {
      continue;
    }

    const signedAmount = toSignedAmount(item.amount, item.type);
    const type = signedAmount < 0 ? 'penalty' : 'bonus';

    syntheticAdjustmentItems.push({
      id: String(item._id),
      userId,
      userName: item.userId && item.userId.name ? item.userId.name : null,
      userSurname: item.userId && item.userId.surname ? item.userId.surname : null,
      localDateKey: dateKey,
      effectiveAt: item.effectiveAt,
      type,
      bonusAmount: toRoundedMoney(type === 'bonus' ? Math.abs(Number(item.amount || 0)) : 0),
      penaltyAmount: toRoundedMoney(type === 'penalty' ? Math.abs(Number(item.amount || 0)) : 0),
      netAdjustment: toRoundedMoney(signedAmount),
      description: item.description || '',
      targetEntryId: targetEntryId || null
    });
  }

  const totalBonus = [...adjustmentByUserDay.values()].reduce(
    (sum, item) => sum + item.bonusAmount,
    0
  );
  const totalPenalty = [...adjustmentByUserDay.values()].reduce(
    (sum, item) => sum + item.penaltyAmount,
    0
  );
  const bonusPenaltyNet = totalBonus - totalPenalty;
  const totalLaborEarned = Number(totals.totalEarned || 0);
  const totalEarnedWithAdjustments = totalLaborEarned + bonusPenaltyNet;

  return sendSuccess(res, {
    range: {
      preset: range.preset,
      label: range.label,
      from: range.from,
      to: range.to
    },
    filters: {
      userId: baseQuery.userId ? String(baseQuery.userId) : undefined
    },
    summary: {
      totalEntries: Number(totals.totalEntries || 0),
      totalMinutes: Number(totals.totalMinutes || 0),
      totalHours: Number(((Number(totals.totalMinutes || 0)) / 60).toFixed(2)),
      totalLaborEarned: toRoundedMoney(totalLaborEarned),
      totalBonus: toRoundedMoney(totalBonus),
      totalPenalty: toRoundedMoney(totalPenalty),
      bonusPenaltyNet: toRoundedMoney(bonusPenaltyNet),
      totalEarned: toRoundedMoney(totalEarnedWithAdjustments)
    },
    items: pageItemsMapped,
    syntheticAdjustmentItems,
    nextCursor: hasNextPage ? encodeCursor(docs[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

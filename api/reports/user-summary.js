const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { getUserFinancialSummary } = require('../../src/helpers/reportAggregations');
const { parseReportDateRange, valueOrZero } = require('../../src/helpers/reports');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { isValidObjectId } = require('../../src/helpers/timeEntries');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  if (!isValidObjectId(req.query.userId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'userId is required and must be a valid ObjectId.');
  }

  const range = parseReportDateRange(req.query);
  if (range.error) {
    return sendError(res, 400, 'VALIDATION_ERROR', range.error);
  }

  await connectToDatabase();

  const userId = new mongoose.Types.ObjectId(req.query.userId);
  const summary = await getUserFinancialSummary({
    userId,
    from: range.from,
    to: range.to
  });

  return sendSuccess(res, {
    userId: String(userId),
    range: {
      from: range.from,
      to: range.to
    },
    laborMinutes: valueOrZero(summary.laborMinutes),
    laborEarnings: valueOrZero(summary.laborEarnings),
    bonusPenaltyTotal: valueOrZero(summary.bonusPenaltyTotal),
    paymentsTotal: valueOrZero(summary.paymentsTotal),
    pendingTotal: valueOrZero(summary.pendingTotal)
  });
}

module.exports = withErrorHandling(requireAuth(handler));

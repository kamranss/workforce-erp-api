const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { isAdminOrSuperAdmin } = require('../../src/helpers/roles');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { CustomerPayment } = require('../../src/models/CustomerPayment');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function splitFullName(fullName) {
  const value = String(fullName || '').trim();
  if (!value) {
    return { name: null, surname: null };
  }

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { name: parts[0], surname: null };
  }

  return {
    name: parts[0],
    surname: parts.slice(1).join(' ')
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  if (!isAdminOrSuperAdmin(req.auth.role)) {
    return sendError(res, 403, 'FORBIDDEN', 'Only admin or superAdmin can access this endpoint.');
  }

  const fromDate = req.query.from ? new Date(req.query.from) : null;
  const toDate = req.query.to ? new Date(req.query.to) : null;
  if (fromDate && Number.isNaN(fromDate.getTime())) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'from must be a valid ISO date when provided.');
  }
  if (toDate && Number.isNaN(toDate.getTime())) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'to must be a valid ISO date when provided.');
  }

  await connectToDatabase();

  const ongoingProjects = await Project.find({
    isActive: true,
    status: 'ongoing'
  })
    .select('_id description quoteAmount customerId address')
    .populate('customerId', 'fullName address email phone')
    .sort({ createdAt: -1, _id: -1 })
    .lean()
    .exec();

  const projectIds = ongoingProjects.map((p) => p._id);
  const paymentMatch = {
    isDeleted: { $ne: true },
    projectId: { $in: projectIds }
  };
  if (fromDate || toDate) {
    paymentMatch.paidAt = {};
    if (fromDate) paymentMatch.paidAt.$gte = fromDate;
    if (toDate) paymentMatch.paidAt.$lte = toDate;
  }

  const paymentAgg = projectIds.length
    ? await CustomerPayment.aggregate([
        { $match: paymentMatch },
        {
          $group: {
            _id: '$projectId',
            mainWorkPaidAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'main_work'] },
                  { $ifNull: ['$amount', 0] },
                  0
                ]
              }
            },
            materialPaidAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'material'] },
                  { $ifNull: ['$amount', 0] },
                  0
                ]
              }
            },
            otherPaidAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'other'] },
                  { $ifNull: ['$amount', 0] },
                  0
                ]
              }
            },
            unknownPaidAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'unknown'] },
                  { $ifNull: ['$amount', 0] },
                  0
                ]
              }
            }
          }
        }
      ])
    : [];

  const paymentsByProject = new Map(
    paymentAgg.map((row) => [
      String(row._id),
      {
        mainWorkPaidAmount: toNumber(row.mainWorkPaidAmount),
        materialPaidAmount: toNumber(row.materialPaidAmount),
        otherPaidAmount: toNumber(row.otherPaidAmount),
        unknownPaidAmount: toNumber(row.unknownPaidAmount)
      }
    ])
  );

  const items = ongoingProjects.map((project) => {
    const projectId = String(project._id);
    const quoteAmount = toNumber(project.quoteAmount);
    const paymentParts = paymentsByProject.get(projectId) || {
      mainWorkPaidAmount: 0,
      materialPaidAmount: 0,
      otherPaidAmount: 0,
      unknownPaidAmount: 0
    };
    const paidAmount = toNumber(paymentParts.mainWorkPaidAmount);
    const materialPaidAmount = toNumber(paymentParts.materialPaidAmount);
    const otherPaidAmount = toNumber(paymentParts.otherPaidAmount);
    const unknownPaidAmount = toNumber(paymentParts.unknownPaidAmount);
    const nonMainWorkPaidAmount = materialPaidAmount + otherPaidAmount + unknownPaidAmount;
    const totalPaidAllTypesAmount = paidAmount + nonMainWorkPaidAmount;
    const remainingRaw = quoteAmount - paidAmount;
    const customerNameParts = splitFullName(project.customerId?.fullName);

    return {
      projectId,
      projectDescription: project.description || null,
      projectAddress: {
        raw: project.address?.raw || null,
        normalized: project.address?.normalized || null
      },
      customerName: project.customerId?.fullName || null,
      customerFirstName: customerNameParts.name,
      customerSurname: customerNameParts.surname,
      customer: project.customerId
        ? {
            id: String(project.customerId._id),
            fullName: project.customerId.fullName || null,
            name: customerNameParts.name,
            surname: customerNameParts.surname,
            address: project.customerId.address || null,
            email: project.customerId.email || null,
            phone: project.customerId.phone || null
          }
        : null,
      quoteAmount,
      paidAmount,
      mainWorkPaidAmount: paidAmount,
      materialPaidAmount,
      otherPaidAmount,
      unknownPaidAmount,
      nonMainWorkPaidAmount,
      totalPaidAllTypesAmount,
      remainingAmount: remainingRaw,
      remainingAmountForPie: remainingRaw > 0 ? remainingRaw : 0,
      overpaidAmount: remainingRaw < 0 ? Math.abs(remainingRaw) : 0
    };
  });

  const totalQuoteAmount = items.reduce((sum, row) => sum + toNumber(row.quoteAmount), 0);
  const totalPaidAmount = items.reduce((sum, row) => sum + toNumber(row.paidAmount), 0);
  const totalMainWorkPaidAmount = totalPaidAmount;
  const totalMaterialPaidAmount = items.reduce((sum, row) => sum + toNumber(row.materialPaidAmount), 0);
  const totalOtherPaidAmount = items.reduce((sum, row) => sum + toNumber(row.otherPaidAmount), 0);
  const totalUnknownPaidAmount = items.reduce((sum, row) => sum + toNumber(row.unknownPaidAmount), 0);
  const totalNonMainWorkPaidAmount =
    totalMaterialPaidAmount + totalOtherPaidAmount + totalUnknownPaidAmount;
  const totalPaidAllTypesAmount = totalMainWorkPaidAmount + totalNonMainWorkPaidAmount;
  const totalRemainingAmount = items.reduce((sum, row) => sum + toNumber(row.remainingAmountForPie), 0);
  const totalOverpaidAmount = items.reduce((sum, row) => sum + toNumber(row.overpaidAmount), 0);

  return sendSuccess(res, {
    range: {
      from: fromDate,
      to: toDate
    },
    summary: {
      ongoingProjectsCount: items.length,
      totalQuoteAmount,
      totalPaidAmount,
      totalMainWorkPaidAmount,
      totalMaterialPaidAmount,
      totalOtherPaidAmount,
      totalUnknownPaidAmount,
      totalNonMainWorkPaidAmount,
      totalPaidAllTypesAmount,
      totalRemainingAmount,
      totalOverpaidAmount
    },
    chart: {
      paidAmount: totalMainWorkPaidAmount,
      mainWorkPaidAmount: totalMainWorkPaidAmount,
      remainingAmount: totalRemainingAmount,
      materialPaidAmount: totalMaterialPaidAmount,
      otherPaidAmount: totalOtherPaidAmount,
      unknownPaidAmount: totalUnknownPaidAmount,
      nonMainWorkPaidAmount: totalNonMainWorkPaidAmount
    },
    items
  });
}

module.exports = withErrorHandling(requireAuth(handler));

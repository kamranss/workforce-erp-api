const { Expense } = require('../models/Expense');

const REFERRAL_EXPENSE_TYPE = 'referral';
const REFERRAL_EXPENSE_SCOPE = 'company';

function toRoundedMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
}

async function softDeleteReferralExpenses(projectId, actorUserId) {
  await Expense.updateMany(
    {
      projectId,
      scope: REFERRAL_EXPENSE_SCOPE,
      type: REFERRAL_EXPENSE_TYPE,
      isDeleted: { $ne: true }
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: actorUserId
      }
    }
  ).exec();
}

async function syncProjectReferralExpense({ project, actorUserId }) {
  const referralPercent = Number(project.referralPercent || 0);
  const quoteAmount = Number(project.quoteAmount || 0);
  const amount = toRoundedMoney((quoteAmount * referralPercent) / 100);

  if (!(referralPercent > 0) || !(amount > 0)) {
    await softDeleteReferralExpenses(project._id, actorUserId);
    return;
  }

  const activeReferralExpenses = await Expense.find({
    projectId: project._id,
    scope: REFERRAL_EXPENSE_SCOPE,
    type: REFERRAL_EXPENSE_TYPE,
    isDeleted: { $ne: true }
  })
    .sort({ createdAt: -1, _id: -1 })
    .exec();

  const primary = activeReferralExpenses[0] || null;
  const duplicates = primary ? activeReferralExpenses.slice(1) : [];

  if (primary) {
    primary.amount = amount;
    primary.spentAt = new Date();
    primary.notes = `Referral ${referralPercent}% of quote`;
    primary.isDeleted = false;
    primary.deletedAt = null;
    primary.deletedBy = null;
    await primary.save();
  } else {
    await Expense.create({
      scope: REFERRAL_EXPENSE_SCOPE,
      projectId: project._id,
      type: REFERRAL_EXPENSE_TYPE,
      amount,
      spentAt: new Date(),
      notes: `Referral ${referralPercent}% of quote`,
      createdBy: actorUserId
    });
  }

  if (duplicates.length > 0) {
    const duplicateIds = duplicates.map((item) => item._id);
    await Expense.updateMany(
      { _id: { $in: duplicateIds } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: actorUserId
        }
      }
    ).exec();
  }
}

module.exports = {
  REFERRAL_EXPENSE_TYPE,
  syncProjectReferralExpense
};

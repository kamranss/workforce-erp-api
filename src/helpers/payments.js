function toPaymentResponse(doc) {
  const userDoc =
    doc.userId && typeof doc.userId === 'object' && doc.userId._id
      ? doc.userId
      : null;
  const paymentOption = userDoc?.paymentOption || null;
  const paymentAmount = typeof userDoc?.paymentAmount === 'number' ? userDoc.paymentAmount : null;
  const paymentAmountLabel =
    paymentAmount === null
      ? null
      : paymentOption === 'hourly'
      ? `$${Number(paymentAmount).toFixed(2)}/hr`
      : paymentOption === 'monthly'
      ? `$${Number(paymentAmount).toFixed(2)}/month`
      : `$${Number(paymentAmount).toFixed(2)}`;

  return {
    id: String(doc._id),
    userId: userDoc ? String(userDoc._id) : String(doc.userId),
    user: userDoc
      ? {
          id: String(userDoc._id),
          name: userDoc.name,
          surname: userDoc.surname,
          paymentOption,
          paymentAmount,
          paymentAmountLabel
        }
      : null,
    userPaymentOption: paymentOption,
    userPaymentAmount: paymentAmount,
    userPaymentAmountLabel: paymentAmountLabel,
    amount: doc.amount,
    paidAt: doc.paidAt,
    method: doc.method,
    description: doc.notes,
    notes: doc.notes,
    createdBy: String(doc.createdBy),
    isDeleted: doc.isDeleted === true,
    deletedAt: doc.deletedAt,
    deletedBy: doc.deletedBy ? String(doc.deletedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

module.exports = {
  toPaymentResponse
};

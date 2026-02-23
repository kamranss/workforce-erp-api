function toBonusAndPenaltyResponse(doc) {
  const userDoc =
    doc.userId && typeof doc.userId === 'object' && doc.userId._id
      ? doc.userId
      : null;

  return {
    id: String(doc._id),
    userId: userDoc ? String(userDoc._id) : String(doc.userId),
    user: userDoc
      ? {
          id: String(userDoc._id),
          name: userDoc.name,
          surname: userDoc.surname
        }
      : null,
    amount: doc.amount,
    description: doc.description,
    effectiveAt: doc.effectiveAt,
    createdBy: String(doc.createdBy),
    isDeleted: doc.isDeleted === true,
    deletedAt: doc.deletedAt,
    deletedBy: doc.deletedBy ? String(doc.deletedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

module.exports = {
  toBonusAndPenaltyResponse
};

function toExpenseResponse(doc) {
  const projectDoc =
    doc.projectId && typeof doc.projectId === 'object' && doc.projectId._id
      ? doc.projectId
      : null;

  return {
    id: String(doc._id),
    scope: doc.scope || 'project',
    projectId: projectDoc ? String(projectDoc._id) : doc.projectId ? String(doc.projectId) : null,
    project: projectDoc
      ? {
          id: String(projectDoc._id),
          description: projectDoc.description,
          status: projectDoc.status
        }
      : null,
    type: doc.type,
    amount: doc.amount,
    spentAt: doc.spentAt,
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
  toExpenseResponse
};

function toLabelCase(value) {
  return String(value || '')
    .split('_')
    .join(' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toExpenseResponse(doc) {
  const projectDoc =
    doc.projectId && typeof doc.projectId === 'object' && doc.projectId._id
      ? doc.projectId
      : null;
  const scope = doc.scope || 'project';
  const type = doc.type || 'unknown';
  const scopeLabel = scope === 'company' ? 'Company Based' : 'Project Based';
  const typeLabel = toLabelCase(type);

  return {
    id: String(doc._id),
    scope,
    expenseScope: scope,
    expenseScopeLabel: scopeLabel,
    projectId: projectDoc ? String(projectDoc._id) : doc.projectId ? String(doc.projectId) : null,
    project: projectDoc
      ? {
          id: String(projectDoc._id),
          description: projectDoc.description,
          status: projectDoc.status,
          address: {
            raw: projectDoc.address?.raw || null,
            normalized: projectDoc.address?.normalized || null
          }
        }
      : null,
    type,
    expenseCategory: type,
    expenseCategoryLabel: typeLabel,
    amount: doc.amount,
    spentAt: doc.spentAt,
    notes: doc.notes || null,
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

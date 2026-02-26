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

function toCustomerPaymentResponse(doc) {
  const projectDoc =
    doc.projectId && typeof doc.projectId === 'object' && doc.projectId._id ? doc.projectId : null;
  const customerDoc =
    doc.customerId && typeof doc.customerId === 'object' && doc.customerId._id ? doc.customerId : null;

  const nameParts = splitFullName(customerDoc?.fullName);

  const type = doc.type || 'main_work';
  const typeLabel =
    type === 'main_work'
      ? 'Main Work'
      : type === 'material'
      ? 'Material'
      : type === 'other'
      ? 'Other'
      : 'Unknown';

  return {
    id: String(doc._id),
    projectId: projectDoc ? String(projectDoc._id) : String(doc.projectId),
    project: projectDoc
      ? {
          id: String(projectDoc._id),
          description: projectDoc.description || null,
          address: {
            raw: projectDoc.address?.raw || null,
            normalized: projectDoc.address?.normalized || null
          }
        }
      : null,
    customerId: customerDoc ? String(customerDoc._id) : doc.customerId ? String(doc.customerId) : null,
    customer: customerDoc
      ? {
          id: String(customerDoc._id),
          fullName: customerDoc.fullName || null,
          name: nameParts.name,
          surname: nameParts.surname,
          address: customerDoc.address || null,
          email: customerDoc.email || null,
          phone: customerDoc.phone || null
        }
      : null,
    type,
    paymentType: type,
    paymentTypeLabel: typeLabel,
    amount: doc.amount,
    paidAt: doc.paidAt,
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
  toCustomerPaymentResponse
};

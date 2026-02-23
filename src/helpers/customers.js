function toCustomerResponse(doc) {
  return {
    id: String(doc._id),
    fullName: doc.fullName,
    address: doc.address || null,
    email: doc.email || null,
    phone: doc.phone || null,
    isDeleted: doc.isDeleted === true,
    deletedAt: doc.deletedAt,
    deletedBy: doc.deletedBy ? String(doc.deletedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

module.exports = {
  toCustomerResponse
};

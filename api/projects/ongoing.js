const mongoose = require('mongoose');
const { connectToDatabase } = require('../../src/db/mongo');
const { withErrorHandling } = require('../../src/helpers/handler');
const { decodeCursor, encodeCursor, parseLimit } = require('../../src/helpers/users');
const { requireAuth } = require('../../src/middleware/auth');
const { sendError, sendMethodNotAllowed, sendSuccess } = require('../../src/helpers/response');
const { Customer } = require('../../src/models/Customer');
const { Project } = require('../../src/models/Project');

function toOngoingProjectResponse(doc) {
  const customerDoc =
    doc.customerId && typeof doc.customerId === 'object' && doc.customerId._id
      ? doc.customerId
      : null;

  return {
    id: String(doc._id),
    description: doc.description,
    customerId: customerDoc
      ? String(customerDoc._id)
      : doc.customerId
      ? String(doc.customerId)
      : null,
    customer: customerDoc
      ? {
          id: String(customerDoc._id),
          fullName: customerDoc.fullName || null,
          address: customerDoc.address || null,
          email: customerDoc.email || null,
          phone: customerDoc.phone || null
        }
      : null,
    address: {
      raw: doc.address?.raw,
      normalized: doc.address?.normalized
    },
    geo: {
      lat: doc.geo?.lat,
      lng: doc.geo?.lng
    },
    geoRadiusMeters: doc.geoRadiusMeters ?? 500,
    quoteNumber: doc.quoteNumber,
    quoteAmount: doc.quoteAmount
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  await connectToDatabase();

  const limit = parseLimit(req.query.limit, 50, 200);
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return sendError(res, 400, 'INVALID_CURSOR', 'cursor is invalid.');
  }

  const query = {
    isActive: true,
    status: { $in: ['waiting', 'ongoing', 'finished'] }
  };

  if (req.query.q) {
    const q = String(req.query.q).trim();
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [{ description: regex }, { 'address.raw': regex }];
    }
  }

  if (cursor) {
    const cursorCondition = {
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ]
    };

    query.$and = [...(query.$and || []), cursorCondition];
  }

  const docs = await Project.find(query)
    .populate('customerId', 'fullName address email phone')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .exec();

  const hasNextPage = docs.length > limit;
  const pageItems = hasNextPage ? docs.slice(0, limit) : docs;

  return sendSuccess(res, {
    items: pageItems.map(toOngoingProjectResponse),
    nextCursor: hasNextPage ? encodeCursor(docs[limit - 1]) : null
  });
}

module.exports = withErrorHandling(requireAuth(handler));

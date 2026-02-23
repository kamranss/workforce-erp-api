const mongoose = require('mongoose');

function toUserResponse(userDoc) {
  return {
    id: String(userDoc._id),
    name: userDoc.name,
    surname: userDoc.surname,
    email: userDoc.email,
    role: userDoc.role,
    paymentOption: userDoc.paymentOption,
    paymentAmount: userDoc.paymentAmount,
    isActive: userDoc.isActive
  };
}

function parseJsonBody(req) {
  if (req.body === undefined || req.body === null) {
    return {};
  }

  if (typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return null;
    }
  }

  return {};
}

function parseLimit(limitValue, defaultLimit, maxLimit) {
  const parsedLimit = Number.parseInt(limitValue, 10);
  if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
    return defaultLimit;
  }

  return Math.min(parsedLimit, maxLimit);
}

function encodeCursor(userDoc) {
  const payload = {
    createdAt: userDoc.createdAt.toISOString(),
    id: String(userDoc._id)
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursorValue) {
  if (!cursorValue || typeof cursorValue !== 'string') {
    return null;
  }

  try {
    const decodedText = Buffer.from(cursorValue, 'base64url').toString('utf8');
    const payload = JSON.parse(decodedText);
    const createdAtDate = new Date(payload.createdAt);

    if (Number.isNaN(createdAtDate.getTime()) || !mongoose.Types.ObjectId.isValid(payload.id)) {
      return null;
    }

    return {
      createdAt: createdAtDate,
      id: payload.id
    };
  } catch (error) {
    return null;
  }
}

module.exports = {
  toUserResponse,
  parseJsonBody,
  parseLimit,
  encodeCursor,
  decodeCursor
};

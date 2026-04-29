const { PROJECT_STATUSES } = require('../models/Project');
const { geocodeAddress } = require('./geocoding');
const { isValidObjectId } = require('./timeEntries');
const MIN_GEOFENCE_RADIUS_METERS = 150;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value) {
  return toTrimmedString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildLocationKey(rawAddress, normalizedAddress) {
  const source = toTrimmedString(normalizedAddress) || toTrimmedString(rawAddress);
  const key = slugify(source);
  return key || 'site';
}

function toRoundedMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function calculateReferralAmount(quoteAmount, referralPercent) {
  if (quoteAmount === null || quoteAmount === undefined || !Number.isFinite(Number(quoteAmount))) {
    return null;
  }

  const quote = Number(quoteAmount);
  const percent =
    referralPercent === null || referralPercent === undefined || !Number.isFinite(Number(referralPercent))
      ? 0
      : Number(referralPercent);

  return toRoundedMoney((quote * percent) / 100);
}

function calculateActualDurationDays(actualStartAt, actualEndAt) {
  if (!actualStartAt || !actualEndAt) {
    return null;
  }

  const startMillis = new Date(actualStartAt).getTime();
  const endMillis = new Date(actualEndAt).getTime();
  if (Number.isNaN(startMillis) || Number.isNaN(endMillis)) {
    return null;
  }

  const diffDays = Math.max(0, (endMillis - startMillis) / MILLIS_PER_DAY);
  return Number(diffDays.toFixed(2));
}

function syncProjectActualDurationDays(project) {
  project.actualDurationDays = calculateActualDurationDays(project.actualStartAt, project.actualEndAt);
}

function hasGeo(payload) {
  return (
    payload &&
    payload.geo &&
    typeof payload.geo.lat === 'number' &&
    Number.isFinite(payload.geo.lat) &&
    typeof payload.geo.lng === 'number' &&
    Number.isFinite(payload.geo.lng)
  );
}

function toEffectiveGeoRadiusMeters(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MIN_GEOFENCE_RADIUS_METERS;
  }

  return Math.max(value, MIN_GEOFENCE_RADIUS_METERS);
}

async function enrichProjectPayload(payload, options = {}) {
  const next = { ...(payload || {}) };
  next.address = { ...(next.address || {}) };
  next.geo = next.geo ? { ...next.geo } : undefined;

  const rawAddress = toTrimmedString(next.address.raw);
  if (!rawAddress) {
    return next;
  }

  const shouldRegenerateLocationKey = options.forceLocationKey === true;
  if (!toTrimmedString(next.locationKey) || shouldRegenerateLocationKey) {
    next.locationKey = buildLocationKey(rawAddress, next.address.normalized);
  }

  const missingNormalized = !toTrimmedString(next.address.normalized);
  const missingCoords =
    next.address.lat === undefined ||
    next.address.lng === undefined ||
    !hasGeo(next);

  if (missingNormalized || missingCoords || options.forceGeocode === true) {
    const geocoded = await geocodeAddress(rawAddress);
    if (geocoded) {
      if (missingNormalized && geocoded.normalized) {
        next.address.normalized = geocoded.normalized;
      }

      if (next.address.lat === undefined) {
        next.address.lat = geocoded.lat;
      }

      if (next.address.lng === undefined) {
        next.address.lng = geocoded.lng;
      }

      if (!next.geo) {
        next.geo = {};
      }

      if (next.geo.lat === undefined) {
        next.geo.lat = geocoded.lat;
      }

      if (next.geo.lng === undefined) {
        next.geo.lng = geocoded.lng;
      }
    }
  }

  return next;
}

function toProjectResponse(projectDoc) {
  const customerDoc =
    projectDoc.customerId && typeof projectDoc.customerId === 'object' && projectDoc.customerId._id
      ? projectDoc.customerId
      : null;

  const referralAmount = calculateReferralAmount(projectDoc.quoteAmount, projectDoc.referralPercent);
  const netQuoteAfterReferral =
    referralAmount === null ? null : toRoundedMoney(Number(projectDoc.quoteAmount || 0) - referralAmount);

  return {
    id: String(projectDoc._id),
    description: projectDoc.description,
    status: projectDoc.status,
    isActive: projectDoc.isActive,
    quoteNumber: projectDoc.quoteNumber,
    quoteAmount: projectDoc.quoteAmount,
    referralPercent: projectDoc.referralPercent,
    referralAmount,
    netQuoteAfterReferral,
    customerId: customerDoc
      ? String(customerDoc._id)
      : projectDoc.customerId
      ? String(projectDoc.customerId)
      : null,
    customer: customerDoc
      ? {
          id: String(customerDoc._id),
          fullName: customerDoc.fullName,
          address: customerDoc.address || null,
          email: customerDoc.email || null,
          phone: customerDoc.phone || null
        }
      : null,
    materials: projectDoc.materials || null,
    clientFullName: projectDoc.clientFullName || null,
    clientPhone: projectDoc.clientPhone || null,
    clientEmail: projectDoc.clientEmail || null,
    estimatedStartAt: projectDoc.estimatedStartAt,
    actualStartAt: projectDoc.actualStartAt,
    actualEndAt: projectDoc.actualEndAt,
    actualDurationDays: projectDoc.actualDurationDays,
    locationKey: projectDoc.locationKey,
    address: {
      raw: projectDoc.address?.raw,
      normalized: projectDoc.address?.normalized,
      lat: projectDoc.address?.lat,
      lng: projectDoc.address?.lng
    },
    geo: {
      lat: projectDoc.geo?.lat,
      lng: projectDoc.geo?.lng
    },
    geoRadiusMeters: toEffectiveGeoRadiusMeters(projectDoc.geoRadiusMeters),
    createdAt: projectDoc.createdAt,
    updatedAt: projectDoc.updatedAt
  };
}

function parseBooleanQuery(value) {
  if (value === undefined) {
    return { provided: false, value: undefined, isValid: true };
  }

  if (typeof value === 'boolean') {
    return { provided: true, value, isValid: true };
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return { provided: true, value: true, isValid: true };
    }

    if (normalized === 'false') {
      return { provided: true, value: false, isValid: true };
    }
  }

  return { provided: true, value: undefined, isValid: false };
}

function sanitizeCreateProjectPayload(payload) {
  return {
    description: payload.description.trim(),
    status: payload.status || 'waiting',
    isActive: payload.isActive === undefined ? true : payload.isActive,
    quoteNumber: payload.quoteNumber === undefined ? undefined : payload.quoteNumber.trim(),
    quoteAmount: payload.quoteAmount,
    referralPercent: payload.referralPercent === undefined ? undefined : payload.referralPercent,
    customerId: payload.customerId === undefined ? undefined : payload.customerId,
    materials:
      payload.materials === undefined
        ? undefined
        : payload.materials === null
        ? null
        : payload.materials.trim(),
    clientFullName:
      payload.clientFullName === undefined
        ? undefined
        : payload.clientFullName === null
        ? null
        : payload.clientFullName.trim(),
    clientPhone:
      payload.clientPhone === undefined
        ? undefined
        : payload.clientPhone === null
        ? null
        : payload.clientPhone.trim(),
    clientEmail:
      payload.clientEmail === undefined
        ? undefined
        : payload.clientEmail === null
        ? null
        : payload.clientEmail.trim().toLowerCase(),
    estimatedStartAt: payload.estimatedStartAt ? new Date(payload.estimatedStartAt) : undefined,
    actualStartAt: payload.actualStartAt ? new Date(payload.actualStartAt) : undefined,
    actualEndAt: payload.actualEndAt ? new Date(payload.actualEndAt) : undefined,
    locationKey: payload.locationKey ? payload.locationKey.trim() : buildLocationKey(payload.address.raw, payload.address.normalized),
    address: {
      raw: payload.address.raw.trim(),
      normalized: payload.address.normalized === undefined ? undefined : payload.address.normalized.trim(),
      lat: payload.address.lat,
      lng: payload.address.lng
    },
    geo: payload.geo
      ? {
          lat: payload.geo.lat,
          lng: payload.geo.lng
        }
      : undefined,
    geoRadiusMeters: payload.geoRadiusMeters
  };
}

function applyProjectPatch(project, payload) {
  if (payload.description !== undefined) {
    project.description = payload.description.trim();
  }

  if (payload.status !== undefined) {
    project.status = payload.status;
  }

  if (payload.isActive !== undefined) {
    project.isActive = payload.isActive;
  }

  if (payload.quoteNumber !== undefined) {
    project.quoteNumber = payload.quoteNumber.trim();
  }

  if (payload.quoteAmount !== undefined) {
    project.quoteAmount = payload.quoteAmount;
  }
  if (payload.referralPercent !== undefined) {
    project.referralPercent = payload.referralPercent;
  }
  if (payload.customerId !== undefined) {
    project.customerId = payload.customerId;
  }
  if (payload.materials !== undefined) {
    project.materials = payload.materials === null ? null : payload.materials.trim();
  }
  if (payload.clientFullName !== undefined) {
    project.clientFullName = payload.clientFullName === null ? null : payload.clientFullName.trim();
  }
  if (payload.clientPhone !== undefined) {
    project.clientPhone = payload.clientPhone === null ? null : payload.clientPhone.trim();
  }
  if (payload.clientEmail !== undefined) {
    project.clientEmail =
      payload.clientEmail === null ? null : payload.clientEmail.trim().toLowerCase();
  }

  if (payload.estimatedStartAt !== undefined) {
    project.estimatedStartAt = payload.estimatedStartAt ? new Date(payload.estimatedStartAt) : null;
  }
  if (payload.actualStartAt !== undefined) {
    project.actualStartAt = payload.actualStartAt ? new Date(payload.actualStartAt) : null;
  }
  if (payload.actualEndAt !== undefined) {
    project.actualEndAt = payload.actualEndAt ? new Date(payload.actualEndAt) : null;
  }

  if (payload.locationKey !== undefined) {
    project.locationKey = payload.locationKey.trim();
  }

  if (payload.geo !== undefined) {
    if (!project.geo) {
      project.geo = {};
    }

    if (payload.geo.lat !== undefined) {
      project.geo.lat = payload.geo.lat;
    }

    if (payload.geo.lng !== undefined) {
      project.geo.lng = payload.geo.lng;
    }
  }

  if (payload.geoRadiusMeters !== undefined) {
    project.geoRadiusMeters = payload.geoRadiusMeters;
  }

  if (payload.address !== undefined) {
    if (payload.address.raw !== undefined) {
      project.address.raw = payload.address.raw.trim();
    }

    if (payload.address.normalized !== undefined) {
      project.address.normalized = payload.address.normalized.trim();
    }

    if (payload.address.lat !== undefined) {
      project.address.lat = payload.address.lat;
    }

    if (payload.address.lng !== undefined) {
      project.address.lng = payload.address.lng;
    }
  }
}

function buildProjectListFilters(query) {
  const conditions = [];

  if (query.status !== undefined) {
    if (!PROJECT_STATUSES.includes(query.status)) {
      return { error: 'status must be one of: waiting, ongoing, review, finished, canceled.' };
    }

    conditions.push({ status: query.status });
  }

  const isActiveParsed = parseBooleanQuery(query.isActive);
  if (!isActiveParsed.isValid) {
    return { error: 'isActive must be true or false when provided.' };
  }

  if (isActiveParsed.provided) {
    conditions.push({ isActive: isActiveParsed.value });
  }

  if (query.locationKey !== undefined) {
    if (typeof query.locationKey !== 'string' || query.locationKey.trim().length === 0) {
      return { error: 'locationKey must be a non-empty string when provided.' };
    }

    conditions.push({ locationKey: query.locationKey.trim() });
  }

  if (query.customerId !== undefined) {
    if (!isValidObjectId(query.customerId)) {
      return { error: 'customerId must be a valid ObjectId when provided.' };
    }
    conditions.push({ customerId: query.customerId });
  }

  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    conditions.push({
      $or: [
        { description: regex },
        { materials: regex },
        { 'address.raw': regex },
        { 'address.normalized': regex },
        { quoteNumber: regex }
      ]
    });
  }

  return {
    filter: conditions.length > 0 ? { $and: conditions } : {}
  };
}

module.exports = {
  toProjectResponse,
  sanitizeCreateProjectPayload,
  applyProjectPatch,
  syncProjectActualDurationDays,
  buildProjectListFilters,
  enrichProjectPayload,
  buildLocationKey
};

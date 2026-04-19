const mongoose = require('mongoose');
const { TimeEntry } = require('../models/TimeEntry');

function toTimeEntryResponse(entryDoc) {
  const userDoc =
    entryDoc.userId && typeof entryDoc.userId === 'object' && entryDoc.userId._id
      ? entryDoc.userId
      : null;
  const projectIdIn = entryDoc.projectIdIn || entryDoc.projectId;
  const projectInDoc =
    projectIdIn && typeof projectIdIn === 'object' && projectIdIn._id
      ? projectIdIn
      : entryDoc.projectIdIn && typeof entryDoc.projectIdIn === 'object' && entryDoc.projectIdIn._id
      ? entryDoc.projectIdIn
      : entryDoc.projectId && typeof entryDoc.projectId === 'object' && entryDoc.projectId._id
      ? entryDoc.projectId
      : null;
  const projectOutDoc =
    entryDoc.projectIdOut && typeof entryDoc.projectIdOut === 'object' && entryDoc.projectIdOut._id
      ? entryDoc.projectIdOut
      : null;

  const earnedAmount =
    typeof entryDoc.minutesWorked === 'number' && typeof entryDoc.hourlyRateAtTime === 'number'
      ? Number(((entryDoc.minutesWorked / 60) * entryDoc.hourlyRateAtTime).toFixed(2))
      : null;

  return {
    id: String(entryDoc._id),
    userId: userDoc ? String(userDoc._id) : String(entryDoc.userId),
    user: userDoc
      ? {
          id: String(userDoc._id),
          name: userDoc.name,
          surname: userDoc.surname,
          email: userDoc.email,
          role: userDoc.role
        }
      : null,
    projectIdIn: projectIdIn
      ? String(projectIdIn._id ? projectIdIn._id : projectIdIn)
      : null,
    projectIdOut: entryDoc.projectIdOut ? String(entryDoc.projectIdOut) : null,
    projectIn: projectInDoc
      ? {
          id: String(projectInDoc._id),
          description: projectInDoc.description,
          locationKey: projectInDoc.locationKey,
          address: {
            raw: projectInDoc.address?.raw,
            normalized: projectInDoc.address?.normalized
          }
        }
      : null,
    projectOut: projectOutDoc
      ? {
          id: String(projectOutDoc._id),
          description: projectOutDoc.description,
          locationKey: projectOutDoc.locationKey,
          address: {
            raw: projectOutDoc.address?.raw,
            normalized: projectOutDoc.address?.normalized
          }
        }
      : null,
    clockInAt: entryDoc.clockInAt,
    clockOutAt: entryDoc.clockOutAt,
    rawMinutes: entryDoc.rawMinutes,
    breakMinutes: entryDoc.breakMinutes,
    minutesWorked: entryDoc.minutesWorked,
    hourlyRateAtTime: entryDoc.hourlyRateAtTime,
    earnedAmount,
    geoIn: entryDoc.geoIn
      ? {
          lat: entryDoc.geoIn.lat,
          lng: entryDoc.geoIn.lng
        }
      : null,
    geoOut: entryDoc.geoOut
      ? {
          lat: entryDoc.geoOut.lat,
          lng: entryDoc.geoOut.lng
        }
      : null,
    addrIn: entryDoc.addrIn,
    addrOut: entryDoc.addrOut,
    notes: entryDoc.notes,
    edited: entryDoc.edited === true,
    isDeleted: entryDoc.isDeleted === true,
    deletedAt: entryDoc.deletedAt,
    deletedBy: entryDoc.deletedBy ? String(entryDoc.deletedBy) : null,
    createdAt: entryDoc.createdAt,
    updatedAt: entryDoc.updatedAt
  };
}

function calculateRawMinutes(clockInAt, clockOutAt) {
  const diffMillis = clockOutAt.getTime() - clockInAt.getTime();
  return Math.max(0, Math.floor(diffMillis / 60000));
}

function isValidObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
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

function parseOffsetMinutes(offsetText) {
  // Examples: GMT-6, GMT+05:30
  const match = offsetText.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset'
  });

  const offsetPart = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName');
  return parseOffsetMinutes(offsetPart?.value || 'GMT+0');
}

function getZonedDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number.parseInt(parts.find((part) => part.type === 'year').value, 10),
    month: Number.parseInt(parts.find((part) => part.type === 'month').value, 10),
    day: Number.parseInt(parts.find((part) => part.type === 'day').value, 10)
  };
}

function getLocalDateKey(date, timeZone) {
  const parts = getZonedDateParts(date, timeZone);
  const yyyy = String(parts.year);
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function zonedMidnightUtc(year, month, day, timeZone) {
  let utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0);

  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMillis), timeZone);
    utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60000;
  }

  return new Date(utcMillis);
}

function addOneLocalDay(date, timeZone) {
  const parts = getZonedDateParts(date, timeZone);
  const start = zonedMidnightUtc(parts.year, parts.month, parts.day, timeZone);
  return new Date(start.getTime() + 36 * 60 * 60 * 1000);
}

function getDayRangeForDate(date, timeZone) {
  const startParts = getZonedDateParts(date, timeZone);
  const dayStart = zonedMidnightUtc(startParts.year, startParts.month, startParts.day, timeZone);

  const nextDayParts = getZonedDateParts(addOneLocalDay(date, timeZone), timeZone);
  const nextDayStart = zonedMidnightUtc(nextDayParts.year, nextDayParts.month, nextDayParts.day, timeZone);

  return {
    dayStart,
    dayEnd: new Date(nextDayStart.getTime() - 1)
  };
}

async function recomputeDailyBreakAllocation({
  userId,
  referenceDate,
  timeZone = 'America/Chicago'
}) {
  const referenceKey = getLocalDateKey(referenceDate, timeZone);

  const entries = await TimeEntry.find({
    userId,
    isDeleted: { $ne: true },
    clockInAt: {
      $gte: new Date(referenceDate.getTime() - 36 * 60 * 60 * 1000),
      $lte: new Date(referenceDate.getTime() + 36 * 60 * 60 * 1000)
    }
  }).exec();

  const dayEntries = entries.filter(
    (entry) => getLocalDateKey(entry.clockInAt, timeZone) === referenceKey
  );

  const closedEntries = dayEntries
    .filter((entry) => entry.clockOutAt)
    .sort((a, b) => {
      const aOut = a.clockOutAt.getTime();
      const bOut = b.clockOutAt.getTime();
      if (aOut !== bOut) {
        return aOut - bOut;
      }

      return String(a._id).localeCompare(String(b._id));
    });

  for (const entry of dayEntries) {
    if (entry.clockOutAt) {
      entry.rawMinutes = calculateRawMinutes(entry.clockInAt, entry.clockOutAt);
    } else {
      entry.rawMinutes = null;
    }

    entry.breakMinutes = 0;
    entry.minutesWorked = entry.rawMinutes;
  }

  if (closedEntries.length > 0) {
    // Apply lunch deduction once per local day based on total closed work.
    const totalClosedRawMinutes = closedEntries.reduce(
      (sum, entry) => sum + (entry.rawMinutes || 0),
      0
    );
    const breakMinutesToAllocate = Math.min(
      60,
      Math.max(0, totalClosedRawMinutes - 240)
    );

    if (breakMinutesToAllocate > 0) {
      let remainingBreakToAllocate = breakMinutesToAllocate;

      // Allocate on latest closed entries first so final daily totals are stable
      // without depending on any specific single entry duration.
      for (let i = closedEntries.length - 1; i >= 0 && remainingBreakToAllocate > 0; i -= 1) {
        const entry = closedEntries[i];
        const rawMinutes = entry.rawMinutes || 0;
        if (rawMinutes <= 0) {
          continue;
        }

        const allocatedBreak = Math.min(remainingBreakToAllocate, rawMinutes);
        entry.breakMinutes = allocatedBreak;
        entry.minutesWorked = Math.max(0, rawMinutes - allocatedBreak);
        remainingBreakToAllocate -= allocatedBreak;
      }
    }
  }

  await Promise.all(dayEntries.map((entry) => entry.save()));
}

module.exports = {
  toTimeEntryResponse,
  calculateRawMinutes,
  getLocalDateKey,
  getDayRangeForDate,
  recomputeDailyBreakAllocation,
  isValidObjectId,
  parseBooleanQuery
};

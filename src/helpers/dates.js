function parseOffsetMinutes(offsetText) {
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

function zonedMidnightUtc(year, month, day, timeZone) {
  let utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0);

  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMillis), timeZone);
    utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60000;
  }

  return new Date(utcMillis);
}

function getChicagoDayRange(date = new Date()) {
  const parts = getZonedDateParts(date, 'America/Chicago');
  const from = zonedMidnightUtc(parts.year, parts.month, parts.day, 'America/Chicago');

  const nextDayUtc = new Date(from.getTime() + 36 * 60 * 60 * 1000);
  const nextDayParts = getZonedDateParts(nextDayUtc, 'America/Chicago');
  const nextFrom = zonedMidnightUtc(
    nextDayParts.year,
    nextDayParts.month,
    nextDayParts.day,
    'America/Chicago'
  );

  const to = new Date(nextFrom.getTime() - 1);
  const dateKey = `${String(parts.year)}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;

  return {
    from,
    to,
    dateKey
  };
}

function parseDateOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseRangeWithDefaultDays(query, defaultDays) {
  const fromParsed = parseDateOrNull(query.from);
  const toParsed = parseDateOrNull(query.to);

  if ((query.from !== undefined && !fromParsed) || (query.to !== undefined && !toParsed)) {
    return {
      error: 'from and to must be valid ISO date values when provided.'
    };
  }

  const now = new Date();
  const from = fromParsed || new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  const to = toParsed || now;

  if (from.getTime() > to.getTime()) {
    return {
      error: 'from must be less than or equal to to.'
    };
  }

  return { from, to };
}

function toDateKey(date, timeZone = 'America/Chicago') {
  const parts = getZonedDateParts(date, timeZone);
  return `${String(parts.year)}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getMonthRange(baseDate = new Date(), timeZone = 'America/Chicago') {
  const parts = getZonedDateParts(baseDate, timeZone);
  const from = zonedMidnightUtc(parts.year, parts.month, 1, timeZone);

  const nextMonthYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextFrom = zonedMidnightUtc(nextMonthYear, nextMonth, 1, timeZone);
  const to = new Date(nextFrom.getTime() - 1);

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long'
  }).format(from);

  return {
    from,
    to,
    label: monthLabel
  };
}

function getYearRange(year, timeZone = 'America/Chicago') {
  const from = zonedMidnightUtc(year, 1, 1, timeZone);
  const nextFrom = zonedMidnightUtc(year + 1, 1, 1, timeZone);
  const to = new Date(nextFrom.getTime() - 1);

  return {
    from,
    to,
    label: String(year)
  };
}

function getQuarterRange(year, quarter, timeZone = 'America/Chicago') {
  const quarterMonthStarts = {
    1: 1,
    2: 4,
    3: 7,
    4: 10
  };

  const monthStart = quarterMonthStarts[quarter];
  const from = zonedMidnightUtc(year, monthStart, 1, timeZone);
  const nextQuarterYear = quarter === 4 ? year + 1 : year;
  const nextQuarterMonth = quarter === 4 ? 1 : monthStart + 3;
  const nextFrom = zonedMidnightUtc(nextQuarterYear, nextQuarterMonth, 1, timeZone);
  const to = new Date(nextFrom.getTime() - 1);

  return {
    from,
    to,
    label: `Q${quarter} ${year}`
  };
}

function getMonthRangeForYearMonth(year, month, timeZone = 'America/Chicago') {
  const from = zonedMidnightUtc(year, month, 1, timeZone);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextFrom = zonedMidnightUtc(nextMonthYear, nextMonth, 1, timeZone);
  const to = new Date(nextFrom.getTime() - 1);

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long'
  }).format(from);

  return {
    from,
    to,
    label: `${monthLabel} ${year}`
  };
}

function getPreviousMonthRange(baseDate = new Date(), timeZone = 'America/Chicago') {
  const parts = getZonedDateParts(baseDate, timeZone);
  const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
  const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
  const from = zonedMidnightUtc(prevYear, prevMonth, 1, timeZone);
  const nextFrom = zonedMidnightUtc(parts.year, parts.month, 1, timeZone);
  const to = new Date(nextFrom.getTime() - 1);

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long'
  }).format(from);

  return {
    from,
    to,
    label: monthLabel
  };
}

function getHalfMonthRanges(baseDate = new Date(), timeZone = 'America/Chicago') {
  const parts = getZonedDateParts(baseDate, timeZone);
  const thisMonth = getMonthRange(baseDate, timeZone);

  const day = parts.day;
  const currentHalfStartDay = day <= 15 ? 1 : 16;
  const currentHalfFrom = zonedMidnightUtc(parts.year, parts.month, currentHalfStartDay, timeZone);
  const currentHalfTo =
    day <= 15
      ? zonedMidnightUtc(parts.year, parts.month, 16, timeZone)
      : new Date(thisMonth.to.getTime() + 1);

  const last15From = currentHalfFrom;
  const last15To = new Date(currentHalfTo.getTime() - 1);

  const previousEndExclusive = currentHalfFrom;
  const previousHalfAnchor = new Date(previousEndExclusive.getTime() - 24 * 60 * 60 * 1000);
  const prevParts = getZonedDateParts(previousHalfAnchor, timeZone);
  const prevStartDay = prevParts.day <= 15 ? 1 : 16;
  const previous15From = zonedMidnightUtc(prevParts.year, prevParts.month, prevStartDay, timeZone);
  const previous15To = new Date(previousEndExclusive.getTime() - 1);

  return {
    last15: {
      from: last15From,
      to: last15To,
      label: `${toDateKey(last15From, timeZone)} to ${toDateKey(last15To, timeZone)}`
    },
    previous15: {
      from: previous15From,
      to: previous15To,
      label: `${toDateKey(previous15From, timeZone)} to ${toDateKey(previous15To, timeZone)}`
    }
  };
}

function parseHoursRange(query, timeZone = 'America/Chicago') {
  const preset = typeof query.rangePreset === 'string' ? query.rangePreset.trim() : 'last15';
  const now = new Date();

  if (preset === 'thisMonth') {
    const range = getMonthRange(now, timeZone);
    return { preset, from: range.from, to: range.to, label: range.label };
  }

  if (preset === 'previousMonth') {
    const range = getPreviousMonthRange(now, timeZone);
    return { preset, from: range.from, to: range.to, label: range.label };
  }

  if (preset === 'last15' || preset === 'previous15') {
    const ranges = getHalfMonthRanges(now, timeZone);
    const range = ranges[preset];
    return { preset, from: range.from, to: range.to, label: range.label };
  }

  if (preset === 'custom') {
    const fromParsed = parseDateOrNull(query.from);
    const toParsed = parseDateOrNull(query.to);
    if (!fromParsed || !toParsed) {
      return { error: 'custom range requires valid from and to ISO date values.' };
    }
    if (fromParsed.getTime() > toParsed.getTime()) {
      return { error: 'from must be less than or equal to to.' };
    }
    return {
      preset,
      from: fromParsed,
      to: toParsed,
      label: `${toDateKey(fromParsed, timeZone)} to ${toDateKey(toParsed, timeZone)}`
    };
  }

  return {
    error: 'rangePreset must be one of: last15, previous15, thisMonth, previousMonth, custom.'
  };
}

module.exports = {
  getChicagoDayRange,
  getMonthRange,
  getMonthRangeForYearMonth,
  getQuarterRange,
  getYearRange,
  parseRangeWithDefaultDays,
  parseHoursRange
};

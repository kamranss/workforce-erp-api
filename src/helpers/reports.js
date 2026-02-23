const { parseRangeWithDefaultDays } = require('./dates');

function parseReportDateRange(query) {
  return parseRangeWithDefaultDays(query, 30);
}

function valueOrZero(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return value;
}

module.exports = {
  parseReportDateRange,
  valueOrZero
};

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function geocodeAddress(rawAddress) {
  const query = asString(rawAddress);
  if (!query) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1'
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'User-Agent': process.env.GEOCODING_USER_AGENT || 'archbuild-backend/1.0'
      }
    });

    if (!response.ok) {
      return null;
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0] || {};
    const lat = toFiniteNumber(row.lat);
    const lng = toFiniteNumber(row.lon);
    if (lat === null || lng === null) {
      return null;
    }

    return {
      normalized: asString(row.display_name) || undefined,
      lat,
      lng
    };
  } catch (_error) {
    return null;
  }
}

module.exports = {
  geocodeAddress
};

const EARTH_RADIUS_METERS = 6371000;

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(from, to) {
  const dLat = degreesToRadians(to.lat - from.lat);
  const dLng = degreesToRadians(to.lng - from.lng);

  const fromLatRad = degreesToRadians(from.lat);
  const toLatRad = degreesToRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(fromLatRad) *
      Math.cos(toLatRad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function isWithinRadius(from, to, radiusMeters) {
  const distanceMeters = haversineDistanceMeters(from, to);
  return {
    distanceMeters,
    allowed: distanceMeters <= radiusMeters
  };
}

module.exports = {
  haversineDistanceMeters,
  isWithinRadius
};

const globalCache = global;

if (!globalCache.__simpleRateLimitCache) {
  globalCache.__simpleRateLimitCache = new Map();
}

function enforceRateLimit({ scope, key, limit, windowMs }) {
  const now = Date.now();
  const cacheKey = `${scope}:${key}`;
  const cache = globalCache.__simpleRateLimitCache;
  const current = cache.get(cacheKey);

  if (!current || now >= current.resetAt) {
    cache.set(cacheKey, {
      count: 1,
      resetAt: now + windowMs
    });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (current.count >= limit) {
    const retryAfterMs = Math.max(0, current.resetAt - now);
    return {
      allowed: false,
      retryAfterSec: Math.ceil(retryAfterMs / 1000)
    };
  }

  current.count += 1;
  cache.set(cacheKey, current);
  return { allowed: true, retryAfterSec: 0 };
}

module.exports = {
  enforceRateLimit
};

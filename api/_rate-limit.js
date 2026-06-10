/**
 * @fileoverview In-memory rate limiter for Vercel Serverless Functions
 * Note: In-memory means it resets on cold start. For production at scale,
 * use Upstash Redis. For free tier this is sufficient.
 */

/** @type {Map<string, {count: number, resetAt: number}>} */
const buckets = new Map();

// Cleanup every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit
 * @param {string} key - Unique identifier (e.g., user ID)
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window duration in ms
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count++;

  return {
    allowed: bucket.count <= maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * Rate limit middleware helper
 * @param {Object} req
 * @param {Object} res
 * @param {string} uid - User ID
 * @param {number} maxRequests
 * @param {number} windowMs
 * @returns {boolean} true if rate limited (should return early)
 */
export function rateLimitResponse(req, res, uid, maxRequests = 10, windowMs = 60000) {
  const { allowed, remaining, resetAt } = checkRateLimit(uid, maxRequests, windowMs);

  res.setHeader('X-RateLimit-Limit', String(maxRequests));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

  if (!allowed) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    });
    return true;
  }

  return false;
}

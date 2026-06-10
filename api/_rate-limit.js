/**
 * @fileoverview Firestore-based rate limiter for Vercel Serverless Functions
 * Uses Firestore for persistent rate limiting across cold starts
 */

import { getAdmin } from './_firebase-admin.js';

/**
 * Check rate limit using Firestore
 * @param {string} key - Unique identifier (e.g., user ID)
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window duration in ms
 * @returns {Promise<{ allowed: boolean, remaining: number, resetAt: number }>}
 */
export async function checkRateLimit(key, maxRequests, windowMs) {
  const admin = getAdmin();
  const db = admin.firestore();
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    const docRef = db.collection('rate_limits').doc(key);
    const doc = await docRef.get();

    if (!doc.exists) {
      // First request - create document
      await docRef.set({
        count: 1,
        windowStart: now,
        resetAt: now + windowMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
      };
    }

    const data = doc.data();

    // Reset if window expired
    if (data.resetAt < now) {
      await docRef.update({
        count: 1,
        windowStart: now,
        resetAt: now + windowMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
      };
    }

    // Increment count
    const newCount = data.count + 1;
    await docRef.update({
      count: newCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      allowed: newCount <= maxRequests,
      remaining: Math.max(0, maxRequests - newCount),
      resetAt: data.resetAt,
    };
  } catch (error) {
    console.error('[RateLimit] Firestore error:', error);
    // Fail open - allow request if rate limit check fails
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: now + windowMs,
    };
  }
}

/**
 * Rate limit middleware helper
 * @param {Object} req
 * @param {Object} res
 * @param {string} uid - User ID
 * @param {number} maxRequests
 * @param {number} windowMs
 * @returns {Promise<boolean>} true if rate limited (should return early)
 */
export async function rateLimitResponse(req, res, uid, maxRequests = 10, windowMs = 60000) {
  const { allowed, remaining, resetAt } = await checkRateLimit(uid, maxRequests, windowMs);

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

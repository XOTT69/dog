export const config = {
  runtime: 'nodejs',
};

import { getAdmin, json, verifyAuthHeader } from './_firebase-admin.js';
import { checkRateLimit } from './_rate-limit.js';

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const decoded = await verifyAuthHeader(req);

    // Brute-force protection: max 5 attempts per hour per user
    const { allowed, remaining } = checkRateLimit(
      `join:${decoded.uid}`,
      5,
      60 * 60 * 1000 // 1 hour
    );

    if (!allowed) {
      return json(res, 429, {
        error: 'Забагато спроб. Зачекайте годину.',
        remaining: 0,
      });
    }

    // Validate invite code format
    const rawCode = req.body?.code;
    if (!rawCode || typeof rawCode !== 'string') {
      return json(res, 400, { error: 'Missing invite code' });
    }

    const clean = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(clean)) {
      return json(res, 400, { error: 'Invalid invite code format' });
    }

    const admin = getAdmin();
    const db = admin.firestore();

    // Find workspace by invite code
    const snap = await db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get();
    if (snap.empty) {
      return json(res, 404, { error: 'Workspace not found' });
    }

    const workspaceDoc = snap.docs[0];
    const workspaceId = workspaceDoc.id;
    const workspaceData = workspaceDoc.data();

    // Check member limit (max 10 members per workspace on free tier)
    const membersSnap = await db.collection('workspaces').doc(workspaceId).collection('members').get();
    if (membersSnap.size >= 10) {
      return json(res, 403, { error: 'Workspace is full (max 10 members)' });
    }

    // Check if already a member
    const existingMember = await db.collection('workspaces').doc(workspaceId).collection('members').doc(decoded.uid).get();
    if (existingMember.exists) {
      // Already a member — just update user doc and return success
      await db.collection('users').doc(decoded.uid).set({ workspaceId }, { merge: true });
      return json(res, 200, {
        ok: true,
        workspaceId,
        workspace: {
          name: workspaceData.name || '',
          ownerId: workspaceData.ownerId || '',
          inviteCode: workspaceData.inviteCode || '',
        },
        alreadyMember: true,
      });
    }

    // Add member in transaction
    await db.runTransaction(async (tx) => {
      const userRef = db.collection('users').doc(decoded.uid);
      const memberRef = db.collection('workspaces').doc(workspaceId).collection('members').doc(decoded.uid);

      const profile = {
        uid: decoded.uid,
        email: decoded.email || '',
        displayName: decoded.name || '',
        photoURL: decoded.picture || '',
        role: 'member',
        workspaceId,
      };

      tx.set(userRef, profile, { merge: true });
      tx.set(
        memberRef,
        {
          uid: decoded.uid,
          email: profile.email,
          displayName: profile.displayName,
          photoURL: profile.photoURL,
          role: 'member',
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return json(res, 200, {
      ok: true,
      workspaceId,
      workspace: {
        name: workspaceData.name || '',
        ownerId: workspaceData.ownerId || '',
        inviteCode: workspaceData.inviteCode || '',
      },
    });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || 'Internal server error' });
  }
}

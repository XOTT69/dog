import { getAdmin, json, verifyAuthHeader } from './_firebase-admin.js';

export const config = {
  runtime: 'nodejs'
};

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
    const clean = String(req.body?.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(clean)) {
      return json(res, 400, { error: 'Invalid invite code' });
    }

    const admin = getAdmin();
    const db = admin.firestore();
    const snap = await db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get();
    if (snap.empty) return json(res, 404, { error: 'Workspace not found' });

    const workspaceDoc = snap.docs[0];
    const workspaceId = workspaceDoc.id;
    const workspaceData = workspaceDoc.data();

    await db.runTransaction(async tx => {
      const userRef = db.collection('users').doc(decoded.uid);
      const memberRef = db.collection('workspaces').doc(workspaceId).collection('members').doc(decoded.uid);
      const profile = {
        uid: decoded.uid,
        email: decoded.email || '',
        displayName: decoded.name || '',
        photoURL: decoded.picture || '',
        role: 'member',
        workspaceId
      };

      tx.set(userRef, profile, { merge: true });
      tx.set(memberRef, {
        uid: decoded.uid,
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        role: 'member',
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    return json(res, 200, {
      ok: true,
      workspaceId,
      workspace: {
        name: workspaceData.name || '',
        ownerId: workspaceData.ownerId || '',
        inviteCode: workspaceData.inviteCode || ''
      }
    });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || 'Internal server error' });
  }
}

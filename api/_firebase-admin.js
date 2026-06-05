import admin from 'firebase-admin';

function getPrivateKey() {
  return (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

export function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID || 'dogs-55f5e';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin credentials');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
  });
}

export function getAdmin() {
  getAdminApp();
  return admin;
}

export async function verifyAuthHeader(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Missing auth token');
    error.statusCode = 401;
    throw error;
  }

  try {
    return await getAdmin().auth().verifyIdToken(match[1]);
  } catch (e) {
    const error = new Error('Invalid auth token');
    error.statusCode = 401;
    throw error;
  }
}

export function json(res, status, data) {
  return res.status(status).json(data);
}

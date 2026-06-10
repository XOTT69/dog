/**
 * @fileoverview Firebase operations using compat SDK (works without bundler)
 * firebase global is loaded via <script> tags in index.html
 */

import { state, batch } from './state.js';
import { FIREBASE_CONFIG, MAX_EVENTS_QUERY, VAPID_KEY } from './constants.js';
import { nowTime } from './utils.js';
import { addToQueue, getQueuedEvents, removeFromQueue, getQueueSize } from './offline-queue.js';

// ===== INIT =====
let app, auth, db;
let googleProvider;

/** @type {boolean} */
let firebaseReady = false;

try {
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    throw new Error('Firebase configuration is missing. Please set VITE_FIREBASE_* environment variables.');
  }

  app = firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();

  googleProvider = new firebase.auth.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });

  // Enable offline persistence
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.warn('[Firestore] Persistence:', err.code);
  });

  firebaseReady = true;
} catch (error) {
  console.error('[Firebase] Initialization error:', error);
  // Show error to user
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => showFirebaseError());
  } else {
    showFirebaseError();
  }
  // Don't throw — app should handle missing Firebase gracefully
  firebaseReady = false;
}

function showFirebaseError() {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:1rem;background:#fee;color:#c33;text-align:center;z-index:99999;font-family:sans-serif;';
  errorDiv.textContent = 'Помилка ініціалізації Firebase. Перевірте налаштування.';
  document.body.prepend(errorDiv);
}

// ===== Unsubscribe holders =====
let unsubPet = null;
let unsubEvents = null;
let unsubMembers = null;

// ===== AUTH =====

/**
 * Start auth state listener
 * @param {Function} onReady - Called once user state is determined
 */
export function initAuth(onReady) {
  auth.onAuthStateChanged((user) => {
    batch(() => {
      state.auth.user = user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      } : null;
      state.auth.loading = false;
    });
    onReady(user);
  });

  auth.getRedirectResult().catch((e) => {
    if (e.code && e.code !== 'auth/no-auth-event') {
      console.error('[Auth] Redirect error:', e);
    }
  });
}

/**
 * Sign in with Google
 */
export async function loginGoogle() {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
      await auth.signInWithRedirect(googleProvider);
    } else {
      throw e;
    }
  }
}

/**
 * Sign out
 */
export async function logout() {
  unsubAll();
  await auth.signOut();
  batch(() => {
    state.auth.user = null;
    state.workspace.id = null;
    state.workspace.data = null;
    state.pet.data = null;
    state.events.items = [];
    state.members.items = [];
  });
}

/**
 * Get current user's ID token
 * @returns {Promise<string>}
 */
export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

// ===== WORKSPACE =====

/**
 * Ensure user has a workspace
 * @param {Object} user - Firebase auth user
 */
export async function ensureWorkspace(user) {
  const userDoc = await db.collection('users').doc(user.uid).get();

  if (userDoc.exists && userDoc.data().workspaceId) {
    const wsId = userDoc.data().workspaceId;
    state.workspace.id = wsId;
    const wsDoc = await db.collection('workspaces').doc(wsId).get();
    state.workspace.data = wsDoc.exists ? wsDoc.data() : null;
    return;
  }

  // Create new workspace
  const wsRef = db.collection('workspaces').doc();
  const inviteCode = generateInviteCode();
  const wsData = {
    name: (user.displayName || 'Мій').split(' ')[0],
    ownerId: user.uid,
    inviteCode,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await wsRef.set(wsData);

  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    role: 'owner',
    workspaceId: wsRef.id,
  }, { merge: true });

  await wsRef.collection('members').doc(user.uid).set({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    role: 'owner',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  await wsRef.collection('dogs').doc('primary').set({
    name: '',
    birthDate: '',
    sex: 'хлопчик',
    breed: '',
    toiletMode: 'pad',
    weight: '',
    issues: '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  state.workspace.id = wsRef.id;
  state.workspace.data = wsData;
}

// ===== SUBSCRIPTIONS =====

export function subscribePet() {
  if (unsubPet) unsubPet();
  const wsId = state.workspace.id;
  if (!wsId) return;

  unsubPet = db.collection('workspaces').doc(wsId).collection('dogs').doc('primary')
    .onSnapshot((snap) => {
      batch(() => {
        state.pet.data = snap.exists ? snap.data() : null;
        state.pet.loading = false;
      });
    }, (err) => console.error('[Firestore] Pet error:', err));
}

export function subscribeEvents() {
  if (unsubEvents) unsubEvents();
  const wsId = state.workspace.id;
  if (!wsId) return;

  unsubEvents = db.collection('workspaces').doc(wsId).collection('events')
    .orderBy('createdAt', 'desc')
    .limit(MAX_EVENTS_QUERY)
    .onSnapshot((snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      batch(() => {
        state.events.items = items;
        state.events.loading = false;
      });
    }, (err) => console.error('[Firestore] Events error:', err));
}

export function subscribeMembers() {
  if (unsubMembers) unsubMembers();
  const wsId = state.workspace.id;
  if (!wsId) return;

  unsubMembers = db.collection('workspaces').doc(wsId).collection('members')
    .onSnapshot((snap) => {
      const items = [];
      snap.forEach((d) => items.push(d.data()));
      state.members.items = items;
    }, (err) => console.error('[Firestore] Members error:', err));
}

function unsubAll() {
  if (unsubPet) { unsubPet(); unsubPet = null; }
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
}

// ===== MUTATIONS =====

/**
 * Save pet profile
 * @param {Object} payload
 */
export async function savePetProfile(payload) {
  const wsId = state.workspace.id;
  if (!wsId) throw new Error('No workspace');

  await db.collection('workspaces').doc(wsId).collection('dogs').doc('primary')
    .set({ ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

/**
 * Add event
 * @param {Object} payload
 * @returns {Promise<string>} doc id
 */
export async function addEvent(payload) {
  const wsId = state.workspace.id;
  const user = state.auth.user;
  if (!wsId || !user) throw new Error('No workspace or auth');

  const data = {
    eventType: payload.eventType,
    byUid: user.uid,
    byName: user.displayName || 'Я',
    note: payload.note || '',
    timeLabel: payload.timeLabel || nowTime(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (payload.value != null) data.value = payload.value;

  // Check if offline - queue the event
  if (!navigator.onLine) {
    await addToQueue({ ...data, workspaceId: wsId });
    return 'queued';
  }

  try {
    const docRef = await db.collection('workspaces').doc(wsId).collection('events').add(data);
    return docRef.id;
  } catch (error) {
    console.warn('[Firebase] Failed to add event, queuing offline:', error);
    await addToQueue({ ...data, workspaceId: wsId });
    return 'queued';
  }
}

/**
 * Sync queued events when connection is restored
 * @returns {Promise<void>}
 */
export async function syncQueuedEvents() {
  if (!navigator.onLine) return;

  const queued = await getQueuedEvents();
  if (queued.length === 0) return;

  console.log(`[Firebase] Syncing ${queued.length} queued events`);

  for (const item of queued) {
    try {
      const { id, queuedAt, workspaceId, ...eventData } = item;
      await db.collection('workspaces').doc(workspaceId).collection('events').add(eventData);
      await removeFromQueue(id);
    } catch (error) {
      console.error('[Firebase] Failed to sync queued event:', item.id, error);
    }
  }

  const remaining = await getQueueSize();
  if (remaining > 0) {
    console.warn(`[Firebase] ${remaining} events still queued`);
  }
}

/**
 * Delete event
 * @param {string} eventId
 */
export async function deleteEvent(eventId) {
  const wsId = state.workspace.id;
  if (!wsId || !eventId) return;
  await db.collection('workspaces').doc(wsId).collection('events').doc(eventId).delete();
}

/**
 * Restore deleted event
 * @param {Object} eventData
 * @returns {Promise<string>}
 */
export async function restoreEvent(eventData) {
  const wsId = state.workspace.id;
  if (!wsId) throw new Error('No workspace');

  const data = {
    eventType: eventData.eventType,
    byUid: eventData.byUid || state.auth.user?.uid,
    byName: eventData.byName || 'Я',
    note: eventData.note || '',
    timeLabel: eventData.timeLabel || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (eventData.value != null) data.value = eventData.value;

  const ref = await db.collection('workspaces').doc(wsId).collection('events').add(data);
  return ref.id;
}

// ===== PUSH =====

export async function subscribePush() {
  try {
    if (!firebase.messaging) return;
    const messaging = firebase.messaging();
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });

    if (token && state.workspace.id && state.auth.user) {
      await db.collection('workspaces').doc(state.workspace.id)
        .collection('members').doc(state.auth.user.uid)
        .update({ pushToken: token });
    }
  } catch (e) {
    console.warn('[Push] Failed:', e);
  }
}

// ===== HELPERS =====

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * @fileoverview Firebase initialization with modular SDK + all Firestore operations
 */

import { state, batch } from './state.js';
import { FIREBASE_CONFIG, MAX_EVENTS_QUERY, VAPID_KEY } from './constants.js';
import { tsToDate, nowTime, escapeHtml } from './utils.js';

// ===== SDK Imports (from CDN via importmap in HTML) =====
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import {
  getFirestore,
  doc, collection, collectionGroup,
  getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  query, orderBy, limit, where, onSnapshot,
  serverTimestamp, enableMultiTabIndexedDbPersistence,
  Timestamp
} from 'firebase/firestore';
import { getMessaging, getToken } from 'firebase/messaging';

// ===== INIT =====
const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable offline persistence
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('[Firestore] Multiple tabs open, persistence enabled in first tab only');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firestore] Browser does not support persistence');
  }
});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ===== Unsubscribe holders =====
let unsubPet = null;
let unsubEvents = null;
let unsubMembers = null;

// ===== AUTH =====

/**
 * Start auth state listener. Sets state.auth.user.
 * @param {Function} onReady - Called once user state is determined
 */
export function initAuth(onReady) {
  onAuthStateChanged(auth, async (user) => {
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

  // Handle redirect result (for iOS PWA)
  getRedirectResult(auth).catch((e) => {
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
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
      await signInWithRedirect(auth, googleProvider);
    } else {
      throw e;
    }
  }
}

/**
 * Sign out and clean up subscriptions
 */
export async function logout() {
  unsubAll();
  await signOut(auth);
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
 * Get current user's ID token for API calls
 * @returns {Promise<string>}
 */
export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

// ===== WORKSPACE =====

/**
 * Ensure user has a workspace (create if needed)
 * @param {Object} user - Firebase auth user
 */
export async function ensureWorkspace(user) {
  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists() && userDoc.data().workspaceId) {
    const wsId = userDoc.data().workspaceId;
    state.workspace.id = wsId;

    const wsDoc = await getDoc(doc(db, 'workspaces', wsId));
    state.workspace.data = wsDoc.exists() ? wsDoc.data() : null;
    return;
  }

  // Create new workspace
  const wsRef = doc(collection(db, 'workspaces'));
  const inviteCode = generateInviteCode();
  const wsData = {
    name: (user.displayName || 'Мій').split(' ')[0],
    ownerId: user.uid,
    inviteCode,
    createdAt: serverTimestamp(),
  };

  await setDoc(wsRef, wsData);
  await setDoc(userRef, {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    role: 'owner',
    workspaceId: wsRef.id,
  }, { merge: true });

  await setDoc(doc(db, 'workspaces', wsRef.id, 'members', user.uid), {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    role: 'owner',
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'workspaces', wsRef.id, 'dogs', 'primary'), {
    name: '',
    birthDate: '',
    sex: 'хлопчик',
    breed: '',
    toiletMode: 'pad',
    weight: '',
    issues: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  state.workspace.id = wsRef.id;
  state.workspace.data = wsData;
}

// ===== SUBSCRIPTIONS =====

/**
 * Subscribe to real-time pet data
 */
export function subscribePet() {
  if (unsubPet) unsubPet();
  const wsId = state.workspace.id;
  if (!wsId) return;

  unsubPet = onSnapshot(
    doc(db, 'workspaces', wsId, 'dogs', 'primary'),
    (snap) => {
      batch(() => {
        state.pet.data = snap.exists() ? snap.data() : null;
        state.pet.loading = false;
      });
    },
    (err) => console.error('[Firestore] Pet subscription error:', err)
  );
}

/**
 * Subscribe to real-time events
 */
export function subscribeEvents() {
  if (unsubEvents) unsubEvents();
  const wsId = state.workspace.id;
  if (!wsId) return;

  const q = query(
    collection(db, 'workspaces', wsId, 'events'),
    orderBy('createdAt', 'desc'),
    limit(MAX_EVENTS_QUERY)
  );

  unsubEvents = onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      batch(() => {
        state.events.items = items;
        state.events.loading = false;
      });
    },
    (err) => console.error('[Firestore] Events subscription error:', err)
  );
}

/**
 * Subscribe to workspace members
 */
export function subscribeMembers() {
  if (unsubMembers) unsubMembers();
  const wsId = state.workspace.id;
  if (!wsId) return;

  unsubMembers = onSnapshot(
    collection(db, 'workspaces', wsId, 'members'),
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push(d.data()));
      state.members.items = items;
    },
    (err) => console.error('[Firestore] Members subscription error:', err)
  );
}

function unsubAll() {
  if (unsubPet) { unsubPet(); unsubPet = null; }
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
}

// ===== MUTATIONS =====

/**
 * Save pet profile fields
 * @param {Object} payload - Fields to merge
 */
export async function savePetProfile(payload) {
  const wsId = state.workspace.id;
  if (!wsId) throw new Error('No workspace');

  await setDoc(
    doc(db, 'workspaces', wsId, 'dogs', 'primary'),
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * Add an event
 * @param {Object} payload - { eventType, note?, value?, timeLabel? }
 * @returns {Promise<string>} Document ID
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
    createdAt: serverTimestamp(),
  };
  if (payload.value != null) data.value = payload.value;

  const docRef = await addDoc(
    collection(db, 'workspaces', wsId, 'events'),
    data
  );
  return docRef.id;
}

/**
 * Delete an event
 * @param {string} eventId
 */
export async function deleteEvent(eventId) {
  const wsId = state.workspace.id;
  if (!wsId || !eventId) return;
  await deleteDoc(doc(db, 'workspaces', wsId, 'events', eventId));
}

/**
 * Restore a deleted event
 * @param {Object} eventData - Original event data
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
    createdAt: serverTimestamp(),
  };
  if (eventData.value != null) data.value = eventData.value;

  const ref = await addDoc(collection(db, 'workspaces', wsId, 'events'), data);
  return ref.id;
}

// ===== PUSH =====

/**
 * Subscribe to push notifications
 */
export async function subscribePush() {
  try {
    const messaging = getMessaging(app);
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });

    if (token && state.workspace.id && state.auth.user) {
      await updateDoc(
        doc(db, 'workspaces', state.workspace.id, 'members', state.auth.user.uid),
        { pushToken: token }
      );
    }
  } catch (e) {
    console.warn('[Push] Registration failed:', e);
  }
}

// ===== HELPERS =====

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

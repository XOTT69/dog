/**
 * @fileoverview Firebase operations using compat SDK (works without bundler)
 * firebase global is loaded via <script> tags in index.html
 * Multi-pet support: dogs/{petId} collection, events linked by petId
 */

import { state, batch, STORAGE_KEYS } from './state.js';
import { FIREBASE_CONFIG, MAX_EVENTS_QUERY, VAPID_KEY } from './constants.js';
import { nowTime } from './utils.js';

// ===== INIT =====
const app = firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();

const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.warn('[Firestore] Persistence:', err.code);
});

// ===== Unsubscribe holders =====
let unsubPets = null;
let unsubEvents = null;
let unsubMembers = null;
let unsubCalendar = null;
let subscribedEventsPetId = undefined;

// ===== HELPERS =====

function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function loadOfflineEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.offlineEvents) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineEvents(items) {
  localStorage.setItem(STORAGE_KEYS.offlineEvents, JSON.stringify(items));
  state.events.pending = items;
}

function queuedForCurrentPet() {
  const petId = state.ui.currentPetId;
  return loadOfflineEvents().filter(item => !petId || item.petId === petId);
}

function mergeQueuedEvents(items) {
  const queued = queuedForCurrentPet().map(item => ({
    id: item.localId,
    eventType: item.eventType,
    petId: item.petId,
    byUid: item.byUid,
    byName: item.byName || 'Я',
    note: item.note || '',
    timeLabel: item.timeLabel || nowTime(),
    value: item.value,
    createdAt: item.createdAt,
    pending: true,
  }));
  return [...queued, ...items];
}

function queueEvent(data) {
  const queued = loadOfflineEvents();
  const item = {
    ...data,
    localId: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  queued.unshift(item);
  saveOfflineEvents(queued);
  state.events.items = mergeQueuedEvents(state.events.items.filter(e => !e.pending));
  return item.localId;
}

/**
 * Get current active pet ID
 */
export function getCurrentPetId() {
  return state.ui.currentPetId || null;
}

/**
 * Update current pet and derive state.pet.data
 */
function _syncCurrentPet() {
  const pets = state.pets.items;
  const currentId = state.ui.currentPetId;

  if (!pets.length) {
    state.pet.data = null;
    state.ui.currentPetId = null;
    localStorage.removeItem(STORAGE_KEYS.currentPetId);
    if (unsubEvents) { unsubEvents(); unsubEvents = null; }
    subscribedEventsPetId = null;
    state.events.items = [];
    state.events.loading = false;
    state.events.pending = [];
    return;
  }

  const current = pets.find(p => p.id === currentId) || pets[0];
  if (current) {
    state.ui.currentPetId = current.id;
    localStorage.setItem(STORAGE_KEYS.currentPetId, current.id);
    state.pet.data = { ...current.data, id: current.id, petType: current.data.petType || 'dog' };
    if (subscribedEventsPetId !== current.id) subscribeEvents();
  }
}

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
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isIOS || isStandalone) {
    await auth.signInWithRedirect(googleProvider);
    return;
  }

  try {
    await auth.signInWithPopup(googleProvider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
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
    state.pets.items = [];
    state.pet.data = null;
    state.events.items = [];
    state.events.pending = [];
    state.calendar.items = [];
    state.calendar.loading = false;
    state.members.items = [];
    state.ui.currentPetId = null;
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

    // Migrate: if old primary doc exists, migrate to new format
    await _migrateOldPrimary(wsId);
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

  // Create first pet with UUID
  const firstPetId = generateId();
  await wsRef.collection('dogs').doc(firstPetId).set({
    name: '',
    birthDate: '',
    sex: 'хлопчик',
    breed: '',
    toiletMode: 'pad',
    weight: '',
    issues: '',
    petType: 'dog',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // Save currentPetId to workspace
  await wsRef.update({ currentPetId: firstPetId });

  state.workspace.id = wsRef.id;
  state.workspace.data = wsData;
}

/**
 * Migrate old 'primary' document to new UUID format
 */
async function _migrateOldPrimary(wsId) {
  try {
    const primaryDoc = await db.collection('workspaces').doc(wsId).collection('dogs').doc('primary').get();
    if (primaryDoc.exists) {
      const data = primaryDoc.data();
      // Check if a UUID pet already exists
      const petsSnap = await db.collection('workspaces').doc(wsId).collection('dogs').get();
      const uuidPets = petsSnap.docs.filter(d => d.id !== 'primary');
      if (uuidPets.length === 0) {
        // Migrate primary to UUID
        const newId = generateId();
        await db.collection('workspaces').doc(wsId).collection('dogs').doc(newId).set({
          ...data,
          petType: data.petType || 'dog',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await db.collection('workspaces').doc(wsId).collection('dogs').doc('primary').delete();
        await db.collection('workspaces').doc(wsId).update({ currentPetId: newId });
      } else {
        // Delete orphan primary
        await db.collection('workspaces').doc(wsId).collection('dogs').doc('primary').delete();
      }
    }
  } catch (e) {
    console.warn('[Migration] Error:', e);
  }
}

// ===== SUBSCRIPTIONS =====

/**
 * Subscribe to all pets in workspace
 */
export function subscribePets() {
  if (unsubPets) unsubPets();
  const wsId = state.workspace.id;
  if (!wsId) return;

  unsubPets = db.collection('workspaces').doc(wsId).collection('dogs')
    .orderBy('createdAt', 'asc')
    .onSnapshot((snap) => {
      const items = [];
      snap.forEach((d) => {
        if (d.id !== 'primary') { // Skip old primary docs
          items.push({ id: d.id, data: d.data() });
        }
      });

      batch(() => {
        state.pets.items = items;
        state.pets.loading = false;

        // Sync currentPetId
        const savedId = localStorage.getItem(STORAGE_KEYS.currentPetId);
        if (savedId && items.find(p => p.id === savedId)) {
          state.ui.currentPetId = savedId;
        } else if (items.length > 0) {
          state.ui.currentPetId = items[0].id;
        }

        _syncCurrentPet();
      });
    }, (err) => console.error('[Firestore] Pets error:', err));
}

/**
 * Switch active pet
 */
export function switchPet(petId) {
  if (!petId || petId === state.ui.currentPetId) return;
  state.ui.currentPetId = petId;
  localStorage.setItem(STORAGE_KEYS.currentPetId, petId);
  _syncCurrentPet();
}

/**
 * Add a new pet
 * @param {Object} payload - Pet data
 * @returns {Promise<string>} pet id
 */
export async function addPet(payload) {
  const wsId = state.workspace.id;
  if (!wsId) throw new Error('No workspace');

  const petId = generateId();
  await db.collection('workspaces').doc(wsId).collection('dogs').doc(petId).set({
    name: payload.name || '',
    birthDate: payload.birthDate || '',
    sex: payload.sex || 'хлопчик',
    breed: payload.breed || '',
    toiletMode: payload.toiletMode || 'pad',
    weight: payload.weight || '',
    issues: payload.issues || '',
    petType: payload.petType || 'dog',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // Switch to new pet
  switchPet(petId);
  return petId;
}

/**
 * Remove a pet
 * @param {string} petId
 */
export async function removePet(petId) {
  const wsId = state.workspace.id;
  if (!wsId || !petId) return;

  // Don't remove last pet
  if (state.pets.items.length <= 1) {
    throw new Error('Неможливо видалити останню тварину');
  }

  await db.collection('workspaces').doc(wsId).collection('dogs').doc(petId).delete();

  // Switch to first remaining pet
  const remaining = state.pets.items.filter(p => p.id !== petId);
  if (remaining.length > 0) {
    switchPet(remaining[0].id);
  }
}

export function subscribeEvents() {
  if (unsubEvents) unsubEvents();
  const wsId = state.workspace.id;
  if (!wsId) return;

  const petId = state.ui.currentPetId;
  subscribedEventsPetId = petId || null;
  batch(() => {
    state.events.items = [];
    state.events.loading = true;
  });

  // Build query: filter by petId if available
  let query = db.collection('workspaces').doc(wsId).collection('events')
    .orderBy('createdAt', 'desc')
    .limit(MAX_EVENTS_QUERY);

  if (petId) {
    query = query.where('petId', '==', petId);
  }

  unsubEvents = query.onSnapshot((snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    batch(() => {
      state.events.pending = queuedForCurrentPet();
      state.events.items = mergeQueuedEvents(items);
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

function normalizeCalendarItem(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    source: 'planned',
    title: data.title || 'Задача',
    type: data.type || 'note',
    date: data.date || '',
    time: data.time || '',
    note: data.note || '',
    repeat: data.repeat || 'once',
    done: Boolean(data.done),
    createdBy: data.createdBy || '',
    createdByName: data.createdByName || '',
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export function subscribeCalendarItems() {
  if (unsubCalendar) unsubCalendar();
  const wsId = state.workspace.id;
  if (!wsId) return;

  state.calendar.loading = true;
  unsubCalendar = db.collection('workspaces').doc(wsId).collection('reminders')
    .orderBy('date', 'asc')
    .limit(300)
    .onSnapshot((snap) => {
      const items = [];
      snap.forEach((doc) => items.push(normalizeCalendarItem(doc)));
      batch(() => {
        state.calendar.items = items;
        state.calendar.loading = false;
      });
    }, (err) => {
      console.error('[Firestore] Calendar error:', err);
      state.calendar.loading = false;
    });
}

function unsubAll() {
  if (unsubPets) { unsubPets(); unsubPets = null; }
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
  if (unsubCalendar) { unsubCalendar(); unsubCalendar = null; }
}

/**
 * Re-subscribe events when current pet changes
 * Exported to be called from switchPet / pet switcher
 */
export function resubscribeEvents() {
  subscribeEvents();
}

// ===== MUTATIONS =====

/**
 * Save pet profile (for current or specified pet)
 * @param {Object} payload
 * @param {string} [petId] - defaults to current pet
 */
export async function savePetProfile(payload, petId) {
  const wsId = state.workspace.id;
  if (!wsId) throw new Error('No workspace');

  const targetId = petId || state.ui.currentPetId;
  if (!targetId) throw new Error('No pet selected');

  await db.collection('workspaces').doc(wsId).collection('dogs').doc(targetId)
    .set({ ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

/**
 * Add event (linked to current pet)
 * @param {Object} payload
 * @returns {Promise<string>} doc id
 */
export async function addEvent(payload) {
  const wsId = state.workspace.id;
  const user = state.auth.user;
  const petId = state.ui.currentPetId;
  if (!wsId || !user) throw new Error('No workspace or auth');
  if (!petId) throw new Error('No pet selected');

  const data = {
    eventType: payload.eventType,
    petId: petId || null,
    byUid: user.uid,
    byName: user.displayName || 'Я',
    note: payload.note || '',
    timeLabel: payload.timeLabel || nowTime(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (payload.value != null) data.value = payload.value;

  if (!navigator.onLine) {
    return queueEvent(data);
  }

  try {
    const docRef = await db.collection('workspaces').doc(wsId).collection('events').add(data);
    return docRef.id;
  } catch (e) {
    const msg = e.message?.toLowerCase() || '';
    if (e.code === 'unavailable' || msg.includes('offline') || msg.includes('network')) {
      return queueEvent(data);
    }
    throw e;
  }
}

/**
 * Delete event
 * @param {string} eventId
 */
export async function deleteEvent(eventId) {
  const wsId = state.workspace.id;
  if (!wsId || !eventId) return;
  if (eventId.startsWith('local_')) {
    saveOfflineEvents(loadOfflineEvents().filter(item => item.localId !== eventId));
    state.events.items = state.events.items.filter(item => item.id !== eventId);
    return;
  }
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
    petId: eventData.petId || state.ui.currentPetId || null,
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

export async function addCalendarItem(payload) {
  const wsId = state.workspace.id;
  const user = state.auth.user;
  if (!wsId || !user) throw new Error('No workspace or auth');

  const data = {
    title: payload.title || 'Задача',
    type: payload.type || 'note',
    date: payload.date || '',
    time: payload.time || '',
    note: payload.note || '',
    repeat: payload.repeat || 'once',
    done: Boolean(payload.done),
    createdBy: user.uid,
    createdByName: user.displayName || 'Я',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection('workspaces').doc(wsId).collection('reminders').add(data);
  return ref.id;
}

export async function updateCalendarItem(itemId, patch) {
  const wsId = state.workspace.id;
  if (!wsId || !itemId) return;

  await db.collection('workspaces').doc(wsId).collection('reminders').doc(itemId).set({
    ...patch,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function deleteCalendarItem(itemId) {
  const wsId = state.workspace.id;
  if (!wsId || !itemId) return;
  await db.collection('workspaces').doc(wsId).collection('reminders').doc(itemId).delete();
}

export async function flushOfflineEvents() {
  const wsId = state.workspace.id;
  const user = state.auth.user;
  if (!wsId || !user || !navigator.onLine) return 0;

  const queued = loadOfflineEvents();
  if (!queued.length) return 0;

  const remaining = [];
  let flushed = 0;

  for (const item of queued) {
    try {
      await db.collection('workspaces').doc(wsId).collection('events').add({
        eventType: item.eventType,
        petId: item.petId || null,
        byUid: item.byUid || user.uid,
        byName: item.byName || user.displayName || 'Я',
        note: item.note || '',
        timeLabel: item.timeLabel || nowTime(),
        ...(item.value != null ? { value: item.value } : {}),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      flushed++;
    } catch {
      remaining.push(item);
    }
  }

  saveOfflineEvents(remaining);
  state.events.items = mergeQueuedEvents(state.events.items.filter(e => !e.pending));
  return flushed;
}

export function getOfflineEventCount() {
  return loadOfflineEvents().length;
}

// ===== PUSH =====

export async function subscribePush() {
  try {
    if (!firebase.messaging || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (typeof firebase.messaging.isSupported === 'function') {
      const supported = await firebase.messaging.isSupported();
      if (!supported) return;
    }
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

// ===== MEDICATION SYNC (Firestore + localStorage) =====

const MED_COLLECTION = 'medications';

/**
 * Sync medications from localStorage to Firestore
 * @returns {Promise<void>}
 */
export async function syncMedicationsToFirestore() {
  const wsId = state.workspace.id;
  if (!wsId || !state.auth.user) return;

  try {
    const localData = localStorage.getItem('dc_medications');
    const logData = localStorage.getItem('dc_medication_log');
    if (!localData && !logData) return;

    const batch = db.batch();
    const ref = db.collection('workspaces').doc(wsId).collection(MED_COLLECTION).doc(state.auth.user.uid);

    // Merge medications and log into one document
    const data = {};
    if (localData) data.medications = JSON.parse(localData);
    if (logData) data.medicationLog = JSON.parse(logData);
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    batch.set(ref, data, { merge: true });
    await batch.commit();
  } catch (e) {
    console.warn('[MedSync] Save error:', e);
  }
}

/**
 * Load medications from Firestore into localStorage
 * @returns {Promise<boolean>} true if data was loaded
 */
export async function loadMedicationsFromFirestore() {
  const wsId = state.workspace.id;
  if (!wsId || !state.auth.user) return false;

  try {
    const doc = await db.collection('workspaces').doc(wsId)
      .collection(MED_COLLECTION).doc(state.auth.user.uid).get();

    if (!doc.exists) return false;

    const data = doc.data();
    let loaded = false;

    if (data.medications && Array.isArray(data.medications)) {
      // Only load if localStorage is empty or Firestore is newer
      const local = localStorage.getItem('dc_medications');
      if (!local || local === '[]') {
        localStorage.setItem('dc_medications', JSON.stringify(data.medications));
        loaded = true;
      }
    }

    if (data.medicationLog && Array.isArray(data.medicationLog)) {
      const local = localStorage.getItem('dc_medication_log');
      if (!local || local === '[]') {
        localStorage.setItem('dc_medication_log', JSON.stringify(data.medicationLog));
        loaded = true;
      }
    }

    return loaded;
  } catch (e) {
    console.warn('[MedSync] Load error:', e);
    return false;
  }
}

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
    return;
  }

  const current = pets.find(p => p.id === currentId) || pets[0];
  if (current) {
    state.ui.currentPetId = current.id;
    localStorage.setItem(STORAGE_KEYS.currentPetId, current.id);
    state.pet.data = { ...current.data, id: current.id, petType: current.data.petType || 'dog' };
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
    state.pets.items = [];
    state.pet.data = null;
    state.events.items = [];
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

  // If adding a cat, update toiletMode to 'pad' since cats don't use outdoor toilet
  if (payload.petType === 'cat') {
    await db.collection('workspaces').doc(wsId).collection('dogs').doc(petId).update({
      toiletMode: 'pad'
    });
  }

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
  if (unsubPets) { unsubPets(); unsubPets = null; }
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
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
 * Save training progress to Firestore
 * @param {string} programId
 * @param {Object} progress - {stepIndex: boolean}
 */
export async function saveTrainingProgress(programId, progress) {
  const wsId = state.workspace.id;
  const petId = state.ui.currentPetId;
  if (!wsId || !petId) return;

  await db.collection('workspaces').doc(wsId).collection('dogs').doc(petId)
    .collection('trainingProgress').doc(programId)
    .set({ progress, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

/**
 * Get training progress from Firestore
 * @param {string} programId
 * @returns {Promise<Object>}
 */
export async function getTrainingProgress(programId) {
  const wsId = state.workspace.id;
  const petId = state.ui.currentPetId;
  if (!wsId || !petId) return {};

  try {
    const doc = await db.collection('workspaces').doc(wsId).collection('dogs').doc(petId)
      .collection('trainingProgress').doc(programId).get();
    return doc.exists ? doc.data().progress || {} : {};
  } catch {
    return {};
  }
}

/**
 * Add custom reminder
 * @param {Object} reminder - {label, nextDate, type}
 */
export async function addReminder(reminder) {
  const wsId = state.workspace.id;
  const petId = state.ui.currentPetId;
  if (!wsId || !petId) return;

  const reminders = state.pet.data?.reminders || [];
  reminders.push({
    ...reminder,
    id: Date.now().toString(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  await savePetProfile({ reminders });
}

/**
 * Delete custom reminder
 * @param {string} reminderId
 */
export async function deleteReminder(reminderId) {
  const wsId = state.workspace.id;
  const petId = state.ui.currentPetId;
  if (!wsId || !petId) return;

  const reminders = (state.pet.data?.reminders || []).filter(r => r.id !== reminderId);
  await savePetProfile({ reminders });
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

  const docRef = await db.collection('workspaces').doc(wsId).collection('events').add(data);
  return docRef.id;
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
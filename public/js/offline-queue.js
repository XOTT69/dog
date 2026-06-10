/**
 * @fileoverview Offline queue for events using IndexedDB
 * Stores events when offline and syncs when connection is restored
 */

const DB_NAME = 'DogCoachOffline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_events';

let db = null;

/**
 * Initialize IndexedDB
 */
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Add event to offline queue
 * @param {Object} eventData - Event data to store
 * @returns {Promise<void>}
 */
export async function addToQueue(eventData) {
  try {
    if (!db) await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const item = {
      id: crypto.randomUUID(),
      ...eventData,
      queuedAt: Date.now(),
    };
    
    await new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    console.log('[OfflineQueue] Event queued:', item.id);
  } catch (error) {
    console.error('[OfflineQueue] Failed to queue event:', error);
  }
}

/**
 * Get all queued events
 * @returns {Promise<Array>}
 */
export async function getQueuedEvents() {
  try {
    if (!db) await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[OfflineQueue] Failed to get queued events:', error);
    return [];
  }
}

/**
 * Remove event from queue
 * @param {string} id - Event ID to remove
 * @returns {Promise<void>}
 */
export async function removeFromQueue(id) {
  try {
    if (!db) await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    console.log('[OfflineQueue] Event removed from queue:', id);
  } catch (error) {
    console.error('[OfflineQueue] Failed to remove event:', error);
  }
}

/**
 * Clear all queued events
 * @returns {Promise<void>}
 */
export async function clearQueue() {
  try {
    if (!db) await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    console.log('[OfflineQueue] Queue cleared');
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear queue:', error);
  }
}

/**
 * Get queue size
 * @returns {Promise<number>}
 */
export async function getQueueSize() {
  try {
    if (!db) await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[OfflineQueue] Failed to get queue size:', error);
    return 0;
  }
}

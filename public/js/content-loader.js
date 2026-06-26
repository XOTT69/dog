/**
 * @fileoverview Lazy-loads content JSON files on demand
 */

import { state } from './state.js';

/** @type {Object|null} */
let coursesCache = null;
/** @type {Object|null} */
let knowledgeCache = null;
/** @type {Object|null} */
let breedsCache = null;
/** @type {Object|null} */
let protocolsCache = null;
/** @type {Object|null} */
let socialCache = null;
/** @type {Object|null} */
let tipsCache = null;

/**
 * Load a JSON content file with caching
 * @param {string} filename
 * @returns {Promise<Object>}
 */
async function loadContent(filename) {
  const response = await fetch(`/content/${filename}`);
  if (!response.ok) throw new Error(`Failed to load ${filename}`);
  return response.json();
}

export async function getCourses() {
  if (!coursesCache) coursesCache = await loadContent('courses.json');
  return coursesCache;
}

export async function getKnowledge() {
  if (!knowledgeCache) knowledgeCache = await loadContent('knowledge.json');
  return knowledgeCache;
}

export async function getBreeds() {
  if (!breedsCache) breedsCache = await loadContent('breeds.json');
  return breedsCache;
}

export async function getProtocols() {
  if (!protocolsCache) protocolsCache = await loadContent('protocols.json');
  return protocolsCache;
}

export async function getSocial() {
  if (!socialCache) socialCache = await loadContent('social.json');
  return socialCache;
}

export async function getTips() {
  if (!tipsCache) tipsCache = await loadContent('tips.json');
  return tipsCache;
}

/**
 * Preload all content (called after first render)
 */
export async function preloadAll() {
  if (state.ui.contentLoaded) return;

  try {
    await Promise.all([
      getCourses(),
      getKnowledge(),
      getBreeds(),
      getProtocols(),
      getSocial(),
      getTips(),
    ]);
    state.ui.contentLoaded = true;
  } catch (e) {
    console.warn('[Content] Preload partial failure:', e);
  }
}

/**
 * Get breed profile from cached data
 * @param {string} breedName
 * @returns {Object|null}
 */
export function getBreedProfile(breedName) {
  if (!breedsCache || !breedName) return null;
  const lower = breedName.toLowerCase().trim();

  // Direct match
  for (const [key, profile] of Object.entries(breedsCache)) {
    if (lower.includes(key) || key.includes(lower)) return profile;
  }

  // Word match
  for (const [key, profile] of Object.entries(breedsCache)) {
    const words = key.split(/[\s-]+/);
    for (const word of words) {
      if (word.length > 3 && lower.includes(word)) return profile;
    }
  }

  return breedsCache['метис'] || null;
}

/**
 * @fileoverview Audio system — clicker, whistle, timer alarm
 * iOS PWA compatible (no AudioContext dependency for basic sounds)
 */

/** @type {AudioContext|null} */
let audioCtx = null;

/** @type {string|null} */
let clickerWavSrc = null;

/** @type {string|null} */
let whistleWavSrc = null;

/** @type {boolean} */
let unlocked = false;

// ===== WAV GENERATION =====

/**
 * Convert Float32Array to WAV data URI
 */
function floatToWavDataUri(buffer, sampleRate) {
  const numSamples = buffer.length;
  const bufferSize = 44 + numSamples * 2;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let j = 0; j < bytes.byteLength; j++) binary += String.fromCharCode(bytes[j]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

function generateClickerWav() {
  const sampleRate = 22050;
  const duration = 0.08;
  const samples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    if (t < 0.015) {
      buffer[i] = 0.9 * Math.sign(Math.sin(2 * Math.PI * 2500 * t)) * (1 - t / 0.015);
    } else if (t > 0.04 && t < 0.055) {
      const t2 = t - 0.04;
      buffer[i] = 0.6 * Math.sign(Math.sin(2 * Math.PI * 2000 * t2)) * (1 - t2 / 0.015);
    }
  }
  return floatToWavDataUri(buffer, sampleRate);
}

function generateWhistleWav() {
  const sampleRate = 44100;
  const duration = 0.7;
  const samples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    let freq = 2637;
    if (t < 0.05) freq = 2400 + (237 * t / 0.05);
    const vibrato = 1 + 0.003 * Math.sin(2 * Math.PI * 5 * t);
    let env;
    if (t < 0.01) env = t / 0.01;
    else if (t < duration - 0.08) env = 1.0;
    else env = (duration - t) / 0.08;

    let sample = 0.45 * Math.sin(2 * Math.PI * freq * vibrato * t);
    sample += 0.15 * Math.sin(2 * Math.PI * freq * 2 * vibrato * t);
    sample += 0.05 * Math.sin(2 * Math.PI * freq * 3 * t);
    const noise = (Math.random() * 2 - 1) * 0.04;
    buffer[i] = env * (sample + noise);
  }
  return floatToWavDataUri(buffer, sampleRate);
}

// ===== PUBLIC API =====

/**
 * Unlock audio context (must be called from user gesture)
 */
export function unlock() {
  if (unlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
    if (audioCtx.state === 'suspended') audioCtx.resume();
    unlocked = true;
  } catch { /* non-critical */ }
}

/**
 * Play a sound from data URI
 */
function playSound(src) {
  try {
    const audio = new Audio(src);
    audio.volume = 1.0;
    audio.play().catch(() => {});
  } catch { /* non-critical */ }
}

/**
 * Play clicker sound + haptic
 */
export function playClicker() {
  if (!clickerWavSrc) clickerWavSrc = generateClickerWav();
  playSound(clickerWavSrc);
  if (navigator.vibrate) navigator.vibrate(15);
}

/**
 * Play whistle sound + haptic
 */
export function playWhistle() {
  if (!whistleWavSrc) whistleWavSrc = generateWhistleWav();
  playSound(whistleWavSrc);
  if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
}

/**
 * Play timer alarm (3 beeps)
 */
export function playAlarm() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, now + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.3 + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.3);
      osc.stop(now + i * 0.3 + 0.25);
    }
  } catch { /* non-critical */ }

  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
}

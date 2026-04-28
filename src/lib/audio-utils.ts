/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a unique "fingerprint" from an audio buffer.
 * This is a simplified version of standard acoustic fingerprinting.
 */
export async function generateFingerprint(audioBuffer: AudioBuffer): Promise<string> {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  
  // Downsample and focus on spectral peaks (simplified)
  // We use a combination of length, sample rate, and a rolling hash of data points
  const points = 1000;
  const step = Math.floor(channelData.length / points);
  let hashSource = `${audioBuffer.duration}-${sampleRate}-`;
  
  for (let i = 0; i < points; i++) {
    const val = channelData[i * step];
    // Map -1..1 to hex
    const hex = Math.floor((val + 1) * 127).toString(16).padStart(2, '0');
    hashSource += hex;
  }

  // Use crypto for a deterministic ID
  const msgUint8 = new TextEncoder().encode(hashSource);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex.slice(0, 16).toUpperCase();
}

/**
 * Applies "Humanization" to audio data.
 * - Saturation (Analog Warmth)
 * - Subtle timing jitter
 * - Low-pass shelving for digital air removal
 * - Analog Noise (Dither)
 * - Stereo Widening
 */
export async function humanizeAudio(
  audioBuffer: AudioBuffer,
  ctx: AudioContext,
  params: { 
    saturation: number; 
    jitter: number; 
    air: number; 
    noise: number; 
    tilt: number; 
    mastering: number;
    trimStart?: number;
    trimEnd?: number;
  }
): Promise<AudioBuffer> {
  const startFrame = params.trimStart ? Math.floor(params.trimStart * audioBuffer.sampleRate) : 0;
  const endFrame = params.trimEnd ? Math.floor(params.trimEnd * audioBuffer.sampleRate) : audioBuffer.length;
  const lengthFrames = Math.max(1, endFrame - startFrame);

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    lengthFrames,
    audioBuffer.sampleRate
  );

  const offlineSource = offlineCtx.createBufferSource();
  offlineSource.buffer = audioBuffer;

  // 1. Saturation (Warmth)
  const shaper = offlineCtx.createWaveShaper();
  shaper.curve = makeDistortionCurve(params.saturation * 120);

  // 2. Air Removal (Anti-AI artifacts)
  const filter = offlineCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 22000 - (params.air * 12000);

  // 3. Tilt EQ (Character)
  const tiltFilter = offlineCtx.createBiquadFilter();
  tiltFilter.type = 'highshelf';
  tiltFilter.frequency.value = 1000;
  tiltFilter.gain.value = params.tilt * 6; // +/- 6dB tilt

  // 4. Stereo Widener
  const splitter = offlineCtx.createChannelSplitter(2);
  const merger = offlineCtx.createChannelMerger(2);
  const leftDelay = offlineCtx.createDelay(0.02);
  const rightDelay = offlineCtx.createDelay(0.02);
  leftDelay.delayTime.value = 0;
  rightDelay.delayTime.value = 0.002 * params.saturation;

  // 5. Normalizer/Limiter (Mastering)
  const limiter = offlineCtx.createDynamicsCompressor();
  limiter.threshold.value = -1.0;
  limiter.knee.value = 40;
  limiter.ratio.value = 12;
  limiter.attack.value = 0;
  limiter.release.value = 0.25;

  // Noise Floor
  const noiseNode = offlineCtx.createBufferSource();
  const noiseBuff = offlineCtx.createBuffer(1, audioBuffer.sampleRate * 2, audioBuffer.sampleRate);
  const outNoise = noiseBuff.getChannelData(0);
  for (let i = 0; i < outNoise.length; i++) outNoise[i] = (Math.random() * 2 - 1) * 0.001;
  noiseNode.buffer = noiseBuff;
  noiseNode.loop = true;
  const noiseGain = offlineCtx.createGain();
  noiseGain.gain.value = params.noise * 0.05;

  // Routing
  offlineSource.connect(shaper);
  shaper.connect(filter);
  filter.connect(tiltFilter);
  tiltFilter.connect(splitter);
  
  splitter.connect(leftDelay, 0);
  splitter.connect(rightDelay, 1);
  leftDelay.connect(merger, 0, 0);
  rightDelay.connect(merger, 0, 1);
  
  merger.connect(limiter);
  limiter.connect(offlineCtx.destination);
  
  noiseNode.connect(noiseGain);
  noiseGain.connect(offlineCtx.destination);

  offlineSource.start(0, params.trimStart || 0);
  noiseNode.start(0);
  
  return await offlineCtx.startRendering();
}

function makeDistortionCurve(amount: number) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Analyzes audio for AI-typical signatures (heuristic based).
 * Returns a score from 0 (Human) to 100 (High AI Probability).
 */
export async function analyzeAIDetection(buffer: AudioBuffer): Promise<number> {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  const blockSize = Math.floor(sampleRate / 10); // 100ms blocks
  const variances = [];
  
  for (let i = 0; i < data.length; i += blockSize) {
    let sum = 0;
    const end = Math.min(i + blockSize, data.length);
    for (let j = i; j < end; j++) {
      sum += data[j] * data[j];
    }
    variances.push(Math.sqrt(sum / (end - i)));
  }
  
  let varianceDiff = 0;
  for (let i = 1; i < variances.length; i++) {
    varianceDiff += Math.abs(variances[i] - variances[i-1]);
  }
  
  const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
  const normalizedDiff = varianceDiff / (variances.length * avgVariance || 1);
  
  // AI score: Higher if variance is too consistent (low normalizedDiff)
  const aiScore = Math.max(5, Math.min(98, 100 - (normalizedDiff * 250)));
  
  return Math.round(aiScore);
}

/**
 * Utility to convert AudioBuffer to a downloadable Blob
 */
export async function audioBufferToBlob(buffer: AudioBuffer): Promise<Blob> {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const buffer_arr = new ArrayBuffer(length);
  const view = new DataView(buffer_arr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) { // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16nd bit signed int
      view.setInt16(pos, sample, true); // update view
      pos += 2;
    }
    offset++; // next source sample
  }

  return new Blob([buffer_arr], { type: "audio/wav" });
}


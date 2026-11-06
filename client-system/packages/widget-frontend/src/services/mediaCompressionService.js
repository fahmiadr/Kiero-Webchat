/**
 * Media Compression Service (Widget)
 *
 * Provides client-side compression for images and audio using
 * optimal web formats (WebP/AVIF, Opus/Ogg).
 *
 * @module mediaCompressionService
 */

// =============================================================================
// SMART COMPRESSION CONFIGURATION
// =============================================================================

const IMAGE_CONFIG = {
  qualityTiers: {
    high: 0.85,
    medium: 0.75,
    low: 0.6,
  },
  minQuality: 0.6,
  maxDimension: 1600,
  minDimension: 800,
  minSizeReduction: 0.15,
};

const AUDIO_CONFIG = {
  bitrate: 96000,
  sampleRate: 48000,
  minSizeReduction: 0.15,
};

// Size thresholds - skip compression if already small
const SKIP_THRESHOLDS = {
  image: 100 * 1024, // 100 KB
  audio: 100 * 1024, // 100 KB
};

// =============================================================================
// COMPRESSION VALIDATION
// =============================================================================

/**
 * Validate if compression result is acceptable
 * @param {number} originalSize - Original file size in bytes
 * @param {number} compressedSize - Compressed file size in bytes
 * @param {number} minReduction - Minimum required size reduction (0-1)
 * @returns {{ accept: boolean, reason?: string, reduction: number }}
 */
function validateCompression(originalSize, compressedSize, minReduction = 0.15) {
  const reduction = 1 - compressedSize / originalSize;

  if (reduction <= 0) {
    return { accept: false, reason: 'no_reduction', reduction: 0 };
  }

  if (reduction < minReduction) {
    return { accept: false, reason: 'minimal_reduction', reduction: Math.round(reduction * 100) };
  }

  return { accept: true, reduction: Math.round(reduction * 100) };
}

// =============================================================================
// IMAGE COMPRESSION (Web Worker + OffscreenCanvas)
// =============================================================================

let imageWorker = null;
let workerSupported = null;
let supportedImageFormat = null;

/**
 * Check if OffscreenCanvas is supported
 */
function isOffscreenCanvasSupported() {
  if (workerSupported !== null) return workerSupported;
  try {
    workerSupported =
      typeof OffscreenCanvas !== 'undefined' &&
      typeof new OffscreenCanvas(1, 1).getContext('2d') !== 'undefined';
  } catch {
    workerSupported = false;
  }
  return workerSupported;
}

/**
 * Get or create the image compression worker
 */
function getImageWorker() {
  if (imageWorker) return imageWorker;
  imageWorker = new Worker(new URL('../workers/imageCompressionWorker.js', import.meta.url), {
    type: 'module',
  });
  return imageWorker;
}

/**
 * Detect best supported image format (AVIF > WebP)
 */
async function getBestImageFormat() {
  if (supportedImageFormat) return supportedImageFormat;

  const isAvifSupported = await (async () => {
    try {
      if (typeof OffscreenCanvas === 'undefined') return false;
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 1, 1);
      const blob = await canvas.convertToBlob({ type: 'image/avif' });
      return blob.type === 'image/avif';
    } catch {
      return false;
    }
  })();

  if (isAvifSupported) {
    supportedImageFormat = { format: 'avif', mimeType: 'image/avif' };
  } else {
    supportedImageFormat = { format: 'webp', mimeType: 'image/webp' };
  }

  return supportedImageFormat;
}

/**
 * Get image dimensions efficiently
 * @param {File|Blob|string} source - File, Blob, or URL string
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      if (typeof source !== 'string') {
        URL.revokeObjectURL(img.src);
      }
    };
    img.onerror = (err) => reject(err);

    if (typeof source === 'string') {
      img.src = source;
    } else {
      img.src = URL.createObjectURL(source);
    }
  });
}

/**
 * Smart compress image to AVIF/WebP format
 * Uses Web Worker for non-blocking UI
 *
 * @param {File} file - Original image file
 * @param {Object} options - Override default options
 * @returns {Promise<{file: File, originalSize: number, compressedSize: number, skipped?: boolean, width?: number, height?: number}>}
 */
export async function compressImage(file, options = {}) {
  const formatConfig = await getBestImageFormat();

  const config = {
    ...IMAGE_CONFIG,
    ...formatConfig,
    ...options,
  };

  const originalSize = file.size;

  // Always extract dimensions for layout
  const dims = await getImageDimensions(options.previewUrl || file);

  // Skip if already small
  if (originalSize < SKIP_THRESHOLDS.image) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      skipped: true,
      width: dims.width,
      height: dims.height,
    };
  }

  // Use Web Worker if OffscreenCanvas is supported
  if (isOffscreenCanvasSupported()) {
    return compressImageInWorker(file, config, originalSize, dims);
  }
  return compressImageMainThread(file, config, originalSize, dims);
}

/**
 * Compress image in Web Worker (non-blocking)
 */
async function compressImageInWorker(file, config, originalSize, dims) {
  const worker = getImageWorker();
  const bitmap = await createImageBitmap(file);

  return new Promise((resolve, reject) => {
    const signal = config.signal; // Extract signal from config (merged options)

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (signal) signal.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Compression cancelled', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) return handleAbort();
      signal.addEventListener('abort', handleAbort);
    }

    const handleMessage = (e) => {
      cleanup();

      const result = e.data;

      if (!result.success) {
        reject(new Error(result.error || 'Worker compression failed'));
        return;
      }

      if (result.skipped) {
        resolve({
          file,
          originalSize,
          compressedSize: originalSize,
          skipped: true,
          reason: result.reason,
          width: result.width,
          height: result.height,
        });
        return;
      }

      const extension = config.format === 'avif' ? '.avif' : '.webp';
      const newName = file.name.replace(/\.[^.]+$/, extension);
      const compressedFile = new File([result.blob], newName, {
        type: config.mimeType,
        lastModified: Date.now(),
      });
      resolve({
        file: compressedFile,
        originalSize,
        compressedSize: result.blob.size,
        skipped: false,
        quality: result.quality,
        reduction: result.reduction,
        width: result.width,
        height: result.height,
      });
    };

    const handleError = (e) => {
      cleanup();
      const errorMsg = e.message || e.error?.message || 'Unknown worker error';
      reject(new Error(`Worker error: ${errorMsg}`));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    const { signal: _, ...workerConfig } = config;
    worker.postMessage(
      {
        imageData: bitmap,
        config: workerConfig,
        originalSize: originalSize,
        originalWidth: dims.width,
        originalHeight: dims.height,
      },
      [bitmap],
    );
  });
}

/**
 * Fallback: Compress image on main thread
 */
function compressImageMainThread(file, config, originalSize, _dims) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;
      const originalWidth = width;
      const originalHeight = height;
      const aspectRatio = width / height;

      const isExtremeAspectRatio = aspectRatio > 3 || aspectRatio < 0.33;
      const effectiveMaxDimension = isExtremeAspectRatio
        ? Math.max(config.maxDimension, 2400)
        : config.maxDimension;

      if (width > effectiveMaxDimension || height > effectiveMaxDimension) {
        const ratio = Math.min(effectiveMaxDimension / width, effectiveMaxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const minDim = Math.min(width, height);
      if (
        minDim < config.minDimension &&
        originalWidth >= config.minDimension &&
        originalHeight >= config.minDimension
      ) {
        width = originalWidth;
        height = originalHeight;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const quality = config.qualityTiers?.high || 0.9;

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }

          const validation = validateCompression(originalSize, blob.size, config.minSizeReduction);

          if (!validation.accept) {
            resolve({
              file,
              originalSize,
              compressedSize: originalSize,
              skipped: true,
              reason: validation.reason,
              width: originalWidth,
              height: originalHeight,
            });
            return;
          }

          const extension = config.format === 'avif' ? '.avif' : '.webp';
          const newName = file.name.replace(/\.[^.]+$/, extension);
          const compressedFile = new File([blob], newName, {
            type: config.mimeType,
            lastModified: Date.now(),
          });
          resolve({
            file: compressedFile,
            originalSize,
            compressedSize: blob.size,
            skipped: false,
            quality,
            reduction: validation.reduction,
            width: canvas.width,
            height: canvas.height,
          });
        },
        config.mimeType,
        quality,
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// =============================================================================
// AUDIO COMPRESSION (2-Tier: WebCodecs -> FFmpeg)
// =============================================================================

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegLoading = null;

/**
 * Initialize FFmpeg WASM (singleton pattern)
 */
async function getFFmpeg() {
  if (ffmpeg && ffmpegLoaded) return ffmpeg;
  if (ffmpegLoading) {
    await ffmpegLoading;
    return ffmpeg;
  }

  ffmpegLoading = (async () => {
    try {
      ffmpeg = new FFmpeg();
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpegLoaded = true;
    } catch (error) {
      ffmpegLoading = null;
      throw error;
    }
  })();

  await ffmpegLoading;
  return ffmpeg;
}

/**
 * Audio Compression - Tier 1: WebCodecs API (Opus + Ogg)
 */
async function compressAudioWebCodecs(file, onProgress, signal) {
  if (typeof AudioEncoder === 'undefined') {
    throw new Error('WebCodecs Audio not supported');
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/audioCompressionWorker.js', import.meta.url), {
      type: 'module',
    });

    const TIMEOUT_DURATION = 30000;
    let timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error('Audio compression timeout'));
    }, TIMEOUT_DURATION);

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new Error('Audio compression timeout'));
      }, TIMEOUT_DURATION);
    };

    let audioDuration = 0;

    worker.onmessage = (e) => {
      const { type, progress, success, blob, extension, mimeType, error } = e.data;

      if (type === 'PROGRESS') {
        resetTimeout();
        onProgress(progress);
      } else if (type === 'COMPLETE') {
        clearTimeout(timeoutId);
        worker.terminate();
        onProgress(100);
        resolve({ success, blob, extension, mimeType, duration: audioDuration });
      } else if (type === 'ERROR') {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(new Error(error));
      }
    };

    worker.onerror = (e) => {
      clearTimeout(timeoutId);
      worker.terminate();
      reject(new Error(`Worker error: ${e.message}`));
    };

    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 48000,
        });
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioDuration = audioBuffer.duration;
        audioCtx.close();

        const channels = Math.min(audioBuffer.numberOfChannels, 2);
        const channelData = [];
        const transferList = [];

        for (let i = 0; i < channels; i++) {
          const data = audioBuffer.getChannelData(i).slice();
          channelData.push(data);
          transferList.push(data.buffer);
        }

        worker.postMessage(
          {
            type: 'START',
            channelData,
            sampleRate: audioBuffer.sampleRate,
            numberOfChannels: channels,
            length: audioBuffer.length,
            config: { bitrate: AUDIO_CONFIG.bitrate },
          },
          transferList,
        );
      } catch (err) {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(err);
      }
    })();

    if (signal) {
      if (signal.aborted) {
        worker.terminate();
        reject(new DOMException('Compression cancelled', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(new DOMException('Compression cancelled', 'AbortError'));
      });
    }
  });
}

/**
 * Audio Compression - Tier 2: FFmpeg WASM (AAC Fallback)
 */
async function compressAudioSoftware(file, onProgress = () => {}) {
  const ff = await getFFmpeg();
  const inputName = `input${getExtension(file.name)}`;
  const outputName = 'output.mp4';

  ff.on('progress', (event) => {
    // ffmpeg v0.12 uses 'progress' or 'ratio'
    const p = event.progress ?? event.ratio ?? 0;
    onProgress(Math.round(p * 100));
  });

  await ff.writeFile(inputName, await fetchFile(file));

  await ff.exec(['-i', inputName, '-c:a', 'aac', '-b:a', '128k', '-vn', '-y', outputName]);

  const data = await ff.readFile(outputName);
  const blob = new Blob([data.buffer], { type: 'audio/mp4' });

  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  return {
    success: true,
    blob,
    extension: 'm4a',
    mimeType: 'audio/mp4',
  };
}

function getExtension(filename) {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0] : '';
}

/**
 * Smart compress audio with 2-tier fallback
 * @param {File} file - Audio file
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{file: File, originalSize: number, compressedSize: number, skipped?: boolean}>}
 */
export async function compressAudio(file, onProgress = () => {}, options = {}) {
  const originalSize = file.size;

  // Skip if already small or already optimized formats
  if (
    originalSize < SKIP_THRESHOLDS.audio ||
    file.type === 'audio/webm' ||
    file.type === 'audio/ogg'
  ) {
    return { file, originalSize, compressedSize: originalSize, skipped: true };
  }

  let result,
    method = 'unknown';

  try {
    try {
      result = await compressAudioWebCodecs(file, onProgress, options.signal);
      method = 'webcodecs';
    } catch (e) {
      if (
        e.name === 'AbortError' ||
        e.message.includes('Aborted') ||
        e.message.includes('cancelled')
      ) {
        throw e;
      }
      result = { success: false };
    }

    if (!result.success) {
      result = await compressAudioSoftware(file, onProgress);
      method = 'ffmpeg';
    }

    const validation = validateCompression(
      originalSize,
      result.blob.size,
      AUDIO_CONFIG.minSizeReduction,
    );

    if (!validation.accept) {
      return { file, originalSize, compressedSize: originalSize, skipped: true };
    }

    const newName = file.name.replace(/\.[^.]+$/, `.${result.extension}`);
    const compressedFile = new File([result.blob], newName, {
      type: result.mimeType,
      lastModified: Date.now(),
    });
    return {
      file: compressedFile,
      originalSize,
      compressedSize: result.blob.size,
      skipped: false,
      method,
      reduction: validation.reduction,
      duration: result.duration,
    };
  } catch (error) {
    return { file, originalSize, compressedSize: originalSize, skipped: true, error };
  }
}

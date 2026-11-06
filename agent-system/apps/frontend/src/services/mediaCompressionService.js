/**
 * Media Compression Service
 * 
 * Provides client-side compression for images, videos, and audio using
 * optimal web formats (WebP, VP9/WebM, Opus).
 * 
 * @module mediaCompressionService
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// =============================================================================
// SMART COMPRESSION CONFIGURATION
// Adaptive quality with industry-standard minimums to prevent over-compression
// =============================================================================

const IMAGE_CONFIG = {
    // Quality tiers (WebP/AVIF 0-1 scale)
    qualityTiers: {
        high: 0.85,        // Slightly lower than 0.90 because AVIF is very efficient
        medium: 0.75,
        low: 0.60,
    },
    minQuality: 0.60,
    maxDimension: 1600,
    minDimension: 800,
    // Format will be determined dynamically
    // format: 'avif' | 'webp'
    // mimeType: 'image/avif' | 'image/webp'

    // Compression validation
    minSizeReduction: 0.15,
};

const VIDEO_CONFIG = {
    // CRF tiers (lower = better quality, higher file size)
    crfTiers: {
        excellent: 23,     // Near-lossless
        good: 28,          // Good quality (default)
        acceptable: 33,    // Quality floor
    },
    defaultCrf: 28,        // Default quality level
    minCrf: 23,            // Best quality allowed
    maxCrf: 33,            // Quality floor - never exceed
    // Resolution limits
    maxHeight: 720,        // Max resolution (720p)
    minHeight: 480,        // Never go below 480p
    // Duration-based quality adjustment
    shortVideoDuration: 30,   // Seconds - prioritize quality
    longVideoDuration: 120,   // Seconds - balance quality/size
    // Audio
    audioBitrate: '96k',   // Opus audio (increased from 64k)
    // Validation
    minSizeReduction: 0.20, // Skip if <20% reduction
};

const AUDIO_CONFIG = {
    bitrate: '96k',        // Opus bitrate (increased for quality)
    sampleRate: 48000,     // Opus standard
    minSizeReduction: 0.15, // Skip if <15% reduction
};

// Size thresholds - skip compression if already small
const SKIP_THRESHOLDS = {
    image: 100 * 1024,       // 100 KB
    video: 1 * 1024 * 1024,  // 1 MB
    audio: 100 * 1024,       // 100 KB
};

// =============================================================================
// COMPRESSION VALIDATION HELPERS
// =============================================================================

/**
 * Validate if compression result is acceptable
 * @param {number} originalSize - Original file size in bytes
 * @param {number} compressedSize - Compressed file size in bytes
 * @param {number} minReduction - Minimum required size reduction (0-1)
 * @returns {{ accept: boolean, reason?: string, reduction: number }}
 */
function validateCompression(originalSize, compressedSize, minReduction = 0.15) {
    const reduction = 1 - (compressedSize / originalSize);

    // Reject if compressed is larger or same size
    if (reduction <= 0) {
        return { accept: false, reason: 'no_reduction', reduction: 0 };
    }

    // Reject if reduction too small (not worth quality loss)
    if (reduction < minReduction) {
        return { accept: false, reason: 'minimal_reduction', reduction: Math.round(reduction * 100) };
    }

    return { accept: true, reduction: Math.round(reduction * 100) };
}

// =============================================================================
// FFMPEG SINGLETON
// =============================================================================

let ffmpeg = null;
let ffmpegLoaded = false;  // Track loaded state explicitly
let ffmpegLoading = null;

/**
 * Initialize FFmpeg WASM (singleton pattern)
 * @returns {Promise<FFmpeg>}
 */
async function getFFmpeg() {
    // Already loaded and ready
    if (ffmpeg && ffmpegLoaded) return ffmpeg;

    // Loading in progress - wait for it
    if (ffmpegLoading) {
        await ffmpegLoading;
        return ffmpeg;
    }

    // Start loading
    ffmpegLoading = (async () => {
        try {
            ffmpeg = new FFmpeg();

            // Load FFmpeg core from CDN
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });

            ffmpegLoaded = true;
            console.log('[FFmpeg] WASM loaded successfully');
        } catch (error) {
            console.error('[FFmpeg] Failed to load:', error);
            ffmpegLoading = null; // Allow retry on failure
            throw error;
        }
    })();

    await ffmpegLoading;
    return ffmpeg;
}

// =============================================================================
// IMAGE COMPRESSION (Web Worker + OffscreenCanvas for non-blocking UI)
// =============================================================================

// Worker singleton
let imageWorker = null;
let workerSupported = null;

/**
 * Check if OffscreenCanvas is supported (required for worker-based compression)
 */
function isOffscreenCanvasSupported() {
    if (workerSupported !== null) return workerSupported;
    try {
        workerSupported = typeof OffscreenCanvas !== 'undefined' &&
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
    imageWorker = new Worker(
        new URL('../workers/imageCompressionWorker.js', import.meta.url),
        { type: 'module' }
    );
    return imageWorker;
}

let supportedImageFormat = null;

/**
 * Detect best supported image format (AVIF > WebP)
 */
async function getBestImageFormat() {
    if (supportedImageFormat) return supportedImageFormat;

    // Check AVIF support
    const isAvifSupported = await (async () => {
        try {
            if (typeof OffscreenCanvas === 'undefined') {
                console.log('[SmartCompress] AVIF Detection: OffscreenCanvas not supported');
                return false;
            }
            // Quick check: Try to encode a tiny 1x1 canvas to AVIF
            const canvas = new OffscreenCanvas(1, 1);
            const ctx = canvas.getContext('2d'); // Initialize context is REQUIRED
            // Draw a single pixel (optional but safer for some browsers)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 1, 1);

            const blob = await canvas.convertToBlob({ type: 'image/avif' });

            if (blob.type === 'image/avif') return true;

            console.log(`[SmartCompress] AVIF Detection: Browser returned ${blob.type} instead of image/avif`);
            return false;
        } catch (e) {
            console.warn('[SmartCompress] AVIF Detection Error:', e);
            return false;
        }
    })();

    if (isAvifSupported) {
        console.log('[SmartCompress] Image Tier 1: AVIF Supported');
        supportedImageFormat = { format: 'avif', mimeType: 'image/avif' };
    } else {
        console.log('[SmartCompress] Image Tier 2: WebP Fallback');
        supportedImageFormat = { format: 'webp', mimeType: 'image/webp' };
    }

    return supportedImageFormat;
}

/**
 * Smart compress image to AVIF/WebP format with adaptive quality
 * Uses Web Worker to avoid blocking the main thread
 * Falls back to main thread if OffscreenCanvas not supported
 * 
 * @param {File} file - Original image file
 * @param {Object} options - Override default options
 * @returns {Promise<{file: File, originalSize: number, compressedSize: number, quality?: number}>}
 */
export async function compressImage(file, options = {}) {
    const formatConfig = await getBestImageFormat();

    const config = {
        ...IMAGE_CONFIG,
        ...formatConfig,
        ...options
    };

    const originalSize = file.size;

    // Always extract dimensions for zero layout shift
    // OPTIMIZATION: Use existing previewUrl if available to avoid creating new object URL
    const dims = await getImageDimensions(options.previewUrl || file);

    // Skip if already small
    if (originalSize < SKIP_THRESHOLDS.image) {
        console.log(`[SmartCompress] Image Skipped: Too small (<${(SKIP_THRESHOLDS.image / 1024).toFixed(1)}KB)`);
        return {
            file,
            originalSize,
            compressedSize: originalSize,
            skipped: true,
            width: dims.width,
            height: dims.height
        };
    }

    // Use Web Worker if OffscreenCanvas is supported
    if (isOffscreenCanvasSupported()) {
        return compressImageInWorker(file, config, originalSize, dims);
    }

    // Fallback to main thread (legacy browsers)
    console.log('[SmartCompress] OffscreenCanvas not supported, using main thread');
    return compressImageMainThread(file, config, originalSize, dims);
}

/**
 * Compress image in Web Worker (non-blocking)
 */
async function compressImageInWorker(file, config, originalSize, dims) {
    const worker = getImageWorker();

    // Create ImageBitmap to transfer to worker
    const bitmap = await createImageBitmap(file);

    return new Promise((resolve, reject) => {
        const handleMessage = (e) => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);

            const result = e.data;

            if (!result.success) {
                reject(new Error(result.error || 'Worker compression failed'));
                return;
            }

            if (result.skipped) {
                console.log(`[SmartCompress] Image skipped: ${result.reason} (${result.reduction}% reduction)`);
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

            // Create File from blob
            const extension = config.format === 'avif' ? '.avif' : '.webp';
            const newName = file.name.replace(/\.[^.]+$/, extension);
            const compressedFile = new File([result.blob], newName, {
                type: config.mimeType,
                lastModified: Date.now(),
            });

            console.log(`[SmartCompress] Image compressed: ${result.reduction}% reduction (Worker) Format: ${config.format.toUpperCase()}`);
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
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);

            // Extract meaningful error message
            const errorMsg = e.message || (e.error && e.error.message) || 'Unknown worker error';
            console.error('[SmartCompress] Worker Error Check:', e);
            reject(new Error('Worker error: ' + errorMsg));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        // Send to worker with transferable bitmap
        worker.postMessage({
            imageData: bitmap,
            config: config,
            originalSize: originalSize,
            originalWidth: dims.width,
            originalHeight: dims.height
        }, [bitmap]);
    });
}

/**
 * Fallback: Compress image on main thread (for browsers without OffscreenCanvas)
 */
function compressImageMainThread(file, config, originalSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        img.onload = () => {
            let { width, height } = img;
            const originalWidth = width;
            const originalHeight = height;
            const aspectRatio = width / height;

            // Extreme aspect ratio detection
            const isExtremeAspectRatio = aspectRatio > 3 || aspectRatio < 0.33;
            const effectiveMaxDimension = isExtremeAspectRatio
                ? Math.max(config.maxDimension, 2400)
                : config.maxDimension;

            if (width > effectiveMaxDimension || height > effectiveMaxDimension) {
                const ratio = Math.min(
                    effectiveMaxDimension / width,
                    effectiveMaxDimension / height
                );
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const minDim = Math.min(width, height);
            if (minDim < config.minDimension && originalWidth >= config.minDimension && originalHeight >= config.minDimension) {
                width = originalWidth;
                height = originalHeight;
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            const quality = config.qualityTiers?.high || 0.90;

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error('Failed to compress image'));
                        return;
                    }

                    const validation = validateCompression(originalSize, blob.size, config.minSizeReduction);

                    if (!validation.accept) {
                        console.log(`[SmartCompress] Image skipped: ${validation.reason} (${validation.reduction}% reduction)`);
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

                    console.log(`[SmartCompress] Image compressed: ${validation.reduction}% reduction (Main Thread) Format: ${config.format.toUpperCase()}`);
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
                quality
            );
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
    });
}

// =============================================================================
// VIDEO COMPRESSION (3-Tier Fallback: WebCodecs → MediaRecorder → FFmpeg)
// Industry-grade implementation with hardware acceleration
// =============================================================================

/**
 * Video codec priority list (most efficient to least)
 * Industry standard: AV1 > VP9 > VP8 > H.264
 */
const VIDEO_CODECS = [
    {
        name: 'AV1',
        codec: 'av01.0.04M.08',  // AV1 Main Profile, Level 4.0, 8-bit
        container: 'webm',
        mimeType: 'video/webm',
        efficiency: 1,  // Best compression
    },
    {
        name: 'VP9',
        codec: 'vp09.00.10.08',  // VP9 Profile 0, Level 1.0, 8-bit
        container: 'webm',
        mimeType: 'video/webm',
        efficiency: 2,
    },
    {
        name: 'VP8',
        codec: 'vp8',
        container: 'webm',
        mimeType: 'video/webm',
        efficiency: 3,
    },
    {
        name: 'H.264 High',
        codec: 'avc1.640034',  // H.264 High Profile, Level 5.2
        container: 'mp4',
        mimeType: 'video/mp4',
        efficiency: 3, // Better than Main/Baseline
    },
    {
        name: 'H.264 Main',
        codec: 'avc1.4D0034',  // H.264 Main Profile, Level 5.2
        container: 'mp4',
        mimeType: 'video/mp4',
        efficiency: 4,
    },
    {
        name: 'H.264 Baseline',
        codec: 'avc1.42001E',  // H.264 Baseline Profile, Level 3.0
        container: 'mp4',
        mimeType: 'video/mp4',
        efficiency: 5,
    },
];

/**
 * Audio codec priority list
 */
const AUDIO_CODECS = [
    { name: 'Opus', codec: 'opus', sampleRate: 48000 },
    { name: 'AAC', codec: 'mp4a.40.2', sampleRate: 44100 },
];

/**
 * Detect best available video codec with hardware acceleration
 * Priority: Hardware > Software (regardless of codec efficiency)
 * @param {number} width - Target video width
 * @param {number} height - Target video height
 * @param {number} bitrate - Target bitrate
 * @returns {Promise<{codec: string, name: string, mimeType: string, hwAccel: boolean} | null>}
 */
async function getBestVideoCodec(width, height, bitrate) {
    if (typeof VideoEncoder === 'undefined') {
        return null;
    }

    // Iterate through codecs by priority (Efficiency: AV1 > VP9 > VP8 > H.264)
    for (const codecInfo of VIDEO_CODECS) {
        try {
            // First try with hardware acceleration
            const hwResult = await VideoEncoder.isConfigSupported({
                codec: codecInfo.codec,
                width,
                height,
                bitrate,
                framerate: 30,
                hardwareAcceleration: 'prefer-hardware',
            });

            if (hwResult.supported) {
                console.log(`[WebCodecs] Found hardware-accelerated ${codecInfo.name}`);
                return { ...codecInfo, hwAccel: true };
            }

            // Try software fallback (if efficiency is preferred over speed)
            const swResult = await VideoEncoder.isConfigSupported({
                codec: codecInfo.codec,
                width,
                height,
                bitrate,
                framerate: 30,
                hardwareAcceleration: 'prefer-software',
            });

            if (swResult.supported) {
                console.log(`[WebCodecs] Found software ${codecInfo.name}`);
                return { ...codecInfo, hwAccel: false };
            }
        } catch {
            // Codec not supported, try next
            continue;
        }
    }

    return null;
}

/**
 * Detect best available audio codec
 * @returns {Promise<{codec: string, name: string, sampleRate: number} | null>}
 */
async function getBestAudioCodec() {
    if (typeof AudioEncoder === 'undefined') {
        return null;
    }

    for (const codecInfo of AUDIO_CODECS) {
        try {
            const result = await AudioEncoder.isConfigSupported({
                codec: codecInfo.codec,
                sampleRate: codecInfo.sampleRate,
                numberOfChannels: 2,
                bitrate: 96000,
            });

            if (result.supported) {
                console.log(`[WebCodecs] Found audio codec: ${codecInfo.name}`);
                return codecInfo;
            }
        } catch {
            continue;
        }
    }

    return null;
}

import WebMMuxer from './WebMMuxer';

/**
 * Check if WebCodecs API is available with any supported codec
 * @returns {Promise<{video: Object, audio: Object} | null>}
 */
async function getWebCodecsSupport(width, height, bitrate) {
    const videoCodec = await getBestVideoCodec(width, height, bitrate);
    const audioCodec = await getBestAudioCodec();

    if (!videoCodec) {
        console.log('[WebCodecs] No supported video codec found');
        return null;
    }

    // TIER 1 RULE: Only support WebM-compatible codecs (AV1, VP9, VP8)
    // H.264 (MP4) requires complex atom muxing, so we deliberately "fail" here
    // to let it fall back to Tier 2 (FFmpeg/MediaRecorder) which handles MP4 natively.
    if (videoCodec.mimeType.includes('mp4')) {
        console.log(`[WebCodecs] Codec ${videoCodec.name} is MP4-based. Skipping Tier 1 (leaving for Tier 2 fallback).`);
        return null; // Force Fallback
    }

    return { video: videoCodec, audio: audioCodec };
}

/**
 * Compress video using WebCodecs API (Primary - Best Quality)
 * Uses dynamic codec detection to find best available encoder
 * 
 * @param {File} file - Original video file
 * @param {Object} dims - Video dimensions {width, height}
 * @param {number} duration - Video duration in seconds
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{success: boolean, blob?: Blob, width?: number, height?: number}>}
 */
async function compressVideoWebCodecs(file, dims, duration, onProgress) {
    // Calculate target dimensions first
    const maxTargetHeight = Math.min(VIDEO_CONFIG.maxHeight, dims.height);
    const scale = maxTargetHeight / dims.height;

    // Hardware encoders strictly require even dimensions (divisible by 2, preferably 4)
    // We align to nearest multiple of 4 for maximum compatibility
    const targetWidth = Math.floor((dims.width * scale) / 4) * 4;
    const targetHeight = Math.floor(maxTargetHeight / 4) * 4;

    const videoBitrate = calculateTargetBitrate(targetWidth, targetHeight, duration);

    // Detect best available codecs
    const codecSupport = await getWebCodecsSupport(targetWidth, targetHeight, videoBitrate);

    if (!codecSupport) {
        console.log('[WebCodecs] Not supported or codec delegated to Tier 2, skipping...');
        return { success: false };
    }

    const { video: videoCodec, audio: audioCodec } = codecSupport;
    console.log(`[WebCodecs] Using ${videoCodec.name}${audioCodec ? ` + ${audioCodec.name}` : ''} encoding (${videoCodec.hwAccel ? 'hardware' : 'software'})`);

    return new Promise((resolve) => {
        // Initialize dynamic Keep-Alive timeout
        let timeout;
        const resetTimeoutTimer = () => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                console.warn('[WebCodecs] Timeout after 60s inactivity');
                // We can't easily reach 'cleanup()' from here if it's defined inside async.
                // But we can reject/resolve.
                // Let's leave the resolve here.
                resolve({ success: false, error: 'timeout' });
            }, 60000);
        };

        resetTimeoutTimer(); // Start initial timer

        (async () => {
            try {
                // Create video element for frame extraction
                const video = document.createElement('video');
                video.muted = true;
                video.playsInline = true;
                const blobUrl = URL.createObjectURL(file);
                video.src = blobUrl;

                await new Promise((res, rej) => {
                    video.onloadedmetadata = res;
                    video.onerror = rej;
                });

                const canvas = new OffscreenCanvas(targetWidth, targetHeight);
                const ctx = canvas.getContext('2d');

                // Initialize Worker
                const worker = new Worker(new URL('../workers/videoCompressionWorker.js', import.meta.url), { type: 'module' });

                const cleanup = () => {
                    video.removeAttribute('src');
                    URL.revokeObjectURL(blobUrl);
                    if (timeout) clearTimeout(timeout);
                    worker.terminate();
                };

                // Capture Worker execution errors (e.g., SyntaxError, Import Failure)
                worker.onerror = (e) => {
                    console.error('[WebCodecs Worker] Script Error:', e.message);
                    cleanup();
                    resolve({ success: false, error: `Worker Script Error: ${e.message}` });
                };

                worker.onmessage = (e) => {
                    // Reset timeout on ANY activity from worker
                    resetTimeoutTimer();

                    const { type, progress, blob, error } = e.data;
                    if (type === 'ERROR') {
                        console.error('[WebCodecs Worker] Pipeline Error:', error);
                        cleanup();
                        resolve({ success: false, error });
                    } else if (type === 'LOG') {
                        // Tunnel logs from worker to main console
                        console.log(`[Worker] ${e.data.message}`);
                    } else if (type === 'PROGRESS') {
                        onProgress(progress);
                    } else if (type === 'COMPLETE') {
                        console.log(`[WebCodecs Worker] Complete: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
                        cleanup();
                        resolve({
                            success: true,
                            blob,
                            width: targetWidth,
                            height: targetHeight,
                            mimeType: 'video/webm',
                            extension: 'webm'
                        });
                    }
                };

                // START WORKER PIPELINE
                // Pass the File blob directly. The worker handles MP4Box Demuxing + WebCodecs.
                worker.postMessage({
                    type: 'START',
                    data: {
                        file: file, // Send File/Blob
                        config: {
                            width: targetWidth,
                            height: targetHeight,
                            bitrate: videoBitrate,
                            videoCodec,
                            audioCodec
                        }
                    }
                });

            } catch (error) {
                console.error('[WebCodecs] Main Error:', error);
                resolve({ success: false, error });
            }
        })();
    });
}

/**
 * MediaRecorder codec priority list (most efficient to least)
 * Industry standard for browser recording
 * AV1 support: Chrome 112+
 */
const MEDIA_RECORDER_CODECS = [
    { name: 'AV1+Opus', mimeType: 'video/webm;codecs=av01,opus', type: 'video/webm' },
    { name: 'VP9+Opus', mimeType: 'video/webm;codecs=vp9,opus', type: 'video/webm' },
    { name: 'VP8+Opus', mimeType: 'video/webm;codecs=vp8,opus', type: 'video/webm' },
    { name: 'VP8+Vorbis', mimeType: 'video/webm;codecs=vp8,vorbis', type: 'video/webm' },
    { name: 'H.264+AAC', mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', type: 'video/mp4' },
    { name: 'H.264', mimeType: 'video/mp4;codecs=avc1.42E01E', type: 'video/mp4' },
];

/**
 * Detect best available MediaRecorder codec
 * @returns {{name: string, mimeType: string, type: string} | null}
 */
function getBestMediaRecorderCodec() {
    if (typeof MediaRecorder === 'undefined') {
        return null;
    }

    for (const codec of MEDIA_RECORDER_CODECS) {
        if (MediaRecorder.isTypeSupported(codec.mimeType)) {
            console.log(`[MediaRecorder] Found codec: ${codec.name}`);
            return codec;
        }
    }

    return null;
}

/**
 * Calculate target bitrate based on resolution and duration
 */
function calculateTargetBitrate(width, height, duration) {
    const pixels = width * height;

    let baseBitrate;
    if (pixels <= 480 * 360) {
        baseBitrate = 800_000;   // 800 Kbps for low res
    } else if (pixels <= 854 * 480) {
        baseBitrate = 1_500_000; // 1.5 Mbps for 480p
    } else if (pixels <= 1280 * 720) {
        baseBitrate = 2_500_000; // 2.5 Mbps for 720p
    } else {
        baseBitrate = 4_000_000; // 4 Mbps for higher
    }

    // Reduce bitrate for longer videos
    if (duration > 60) baseBitrate *= 0.8;
    else if (duration > 120) baseBitrate *= 0.6;

    return Math.round(baseBitrate);
}

/**
 * Compress video using MediaRecorder API (Hardware Accelerated)
 * Uses dynamic codec detection for best compatibility
 */
async function compressVideoHardware(file, dims, duration, onProgress) {
    const codec = getBestMediaRecorderCodec();

    if (!codec) {
        console.log('[MediaRecorder] No supported codec found');
        return { success: false };
    }

    console.log(`[MediaRecorder] Using ${codec.name} (hardware-accelerated)`);

    return new Promise((resolve) => {
        try {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;

            const blobUrl = URL.createObjectURL(file);
            video.src = blobUrl;

            video.onloadedmetadata = () => {
                const targetHeight = Math.min(VIDEO_CONFIG.maxHeight, dims.height);
                const scale = targetHeight / dims.height;
                const targetWidth = Math.round(dims.width * scale);

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                const stream = canvas.captureStream(30);
                const videoBitrate = calculateTargetBitrate(targetWidth, targetHeight, duration);

                const recorder = new MediaRecorder(stream, {
                    mimeType: codec.mimeType,
                    videoBitsPerSecond: videoBitrate,
                });

                const chunks = [];

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                recorder.onstop = () => {
                    URL.revokeObjectURL(blobUrl);
                    const blob = new Blob(chunks, { type: codec.type });
                    console.log(`[MediaRecorder] Complete: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
                    resolve({
                        success: true,
                        blob,
                        width: targetWidth,
                        height: targetHeight,
                        codecName: codec.name,
                        mimeType: codec.type,
                        extension: codec.type.includes('mp4') ? 'mp4' : 'webm'
                    });
                };

                recorder.onerror = (err) => {
                    URL.revokeObjectURL(blobUrl);
                    resolve({ success: false, error: err });
                };

                let lastProgress = 0;
                const drawFrame = () => {
                    if (video.paused || video.ended) {
                        recorder.stop();
                        return;
                    }
                    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                    const progress = Math.round((video.currentTime / video.duration) * 100);
                    if (progress !== lastProgress) {
                        lastProgress = progress;
                        onProgress(progress);
                    }
                    requestAnimationFrame(drawFrame);
                };

                video.onplay = () => {
                    recorder.start(100);
                    drawFrame();
                };

                video.onended = () => {
                    if (recorder.state === 'recording') recorder.stop();
                };

                video.playbackRate = 1.0; // 1.0x speed for accurate recording
                video.play().catch(() => resolve({ success: false }));
            };

            video.onerror = () => {
                URL.revokeObjectURL(blobUrl);
                resolve({ success: false });
            };
        } catch (err) {
            resolve({ success: false, error: err });
        }
    });
}

/**
 * Compress video using FFmpeg WASM (Software - CPU fallback)
 * Optimized for speed and compatibility with H.264 + AAC (MP4)
 * Industry standard: H.264 is fastest to encode and universally compatible
 */
async function compressVideoSoftware(file, dims, duration, onProgress) {
    console.log('[FFmpeg] Using H.264 + AAC (fastest, most compatible)');

    const ff = await getFFmpeg();
    const inputName = 'input' + getExtension(file.name);
    const outputName = 'output.mp4';

    ff.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
    });

    await ff.writeFile(inputName, await fetchFile(file));
    const isPortrait = dims.height > dims.width;

    // Calculate final dimensions for scaling
    let finalWidth, finalHeight;

    if (isPortrait) {
        // Portrait: Limit width to 480p (VIDEO_CONFIG.minHeight used as width reference)
        finalWidth = Math.min(dims.width, 480);
        const scale = finalWidth / dims.width;
        finalHeight = Math.round(dims.height * scale);
    } else {
        // Landscape: Limit height to 720p (VIDEO_CONFIG.maxHeight)
        finalHeight = Math.min(dims.height, 720);
        const scale = finalHeight / dims.height;
        finalWidth = Math.round(dims.width * scale);
    }

    // Smart scaling filter based on calculated dimensions
    // Ensure even dimensions for compatibility (FFmpeg -2 does this automatically for one dim)
    const scaleFilter = isPortrait
        ? `scale=${finalWidth}:-2`
        : `scale=-2:${finalHeight}`;

    // H.264 + AAC: Industry standard for speed and compatibility
    await ff.exec([
        '-i', inputName,
        '-c:v', 'libx264',               // H.264 codec (fastest in WASM)
        '-preset', 'ultrafast',          // Fastest encoding preset
        '-crf', '28',                    // Good quality for web
        '-vf', scaleFilter,              // Smart orientation-aware scaling
        '-c:a', 'aac',                   // AAC audio (universal)
        '-b:a', '96k',                   // 96kbps audio
        '-movflags', '+faststart',       // Web-optimized (metadata at start)
        '-threads', '2',                 // Limit threads for WASM memory
        '-y',                            // Overwrite output
        outputName
    ]);

    const data = await ff.readFile(outputName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);

    return {
        success: true,
        blob,
        width: finalWidth,
        height: finalHeight,
        mimeType: 'video/mp4',
        extension: 'mp4'
    };
}

/**
 * Smart compress video with 3-tier fallback:
 * 1. WebCodecs API (AV1/VP9/H.264) - Best efficiency (AV1) or speed (H.264)
 * 2. MediaRecorder API (AV1/VP9/H.264) - Browser-managed hardware encoding
 * 3. FFmpeg WASM (H.264+AAC) - Universal fallback, ultrafast software encoding
 */
export async function compressVideo(file, onProgress = () => { }) {
    const originalSize = file.size;
    const dims = await getVideoDimensions(file).catch(() => ({ width: 1920, height: 1080 }));

    // Video compression is disabled - pass through the original file
    // Reason: Browser-based video transcoding is unstable for large files.
    // For production, use server-side transcoding or accept raw uploads.
    console.log('[Video] Compression disabled. Passing through raw file.');
    return { file, originalSize, compressedSize: originalSize, skipped: true, reason: 'compression_disabled', width: dims.width, height: dims.height };
}

/**
 * Get video duration from File
 * @param {File} source - Video file
 * @returns {Promise<number>} Duration in seconds
 */
function getVideoDuration(source) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = () => {
            resolve(video.duration);
            URL.revokeObjectURL(video.src);
            video.src = '';
        };
        video.onerror = (err) => {
            reject(err);
            URL.revokeObjectURL(video.src);
        };

        video.src = URL.createObjectURL(source);
    });
}

// =============================================================================
// AUDIO COMPRESSION (2-Tier: WebCodecs -> FFmpeg)
// =============================================================================

/**
 * Audio Compression - Tier 1: WebCodecs API (Opus + Ogg)
 * Runs in Web Worker for non-blocking UI
 */
async function compressAudioWebCodecs(file, onProgress) {
    // Check if AudioEncoder is available (basic feature detection)
    if (typeof AudioEncoder === 'undefined') {
        throw new Error('WebCodecs Audio not supported');
    }

    return new Promise((resolve, reject) => {
        const worker = new Worker(
            new URL('../workers/audioCompressionWorker.js', import.meta.url),
            { type: 'module' }
        );

        // Keep-alive timeout: Resets on each progress update
        const TIMEOUT_DURATION = 30000; // 30 seconds of inactivity
        let timeoutId = setTimeout(() => {
            worker.terminate();
            reject(new Error('Audio compression timeout (no activity)'));
        }, TIMEOUT_DURATION);

        const resetTimeout = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                worker.terminate();
                reject(new Error('Audio compression timeout (no activity)'));
            }, TIMEOUT_DURATION);
        };

        worker.onmessage = (e) => {
            const { type, progress, success, blob, extension, mimeType, error } = e.data;

            if (type === 'PROGRESS') {
                resetTimeout(); // Keep-alive: compression is still active
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

        let audioDuration = 0;

        // Decode audio on main thread (OfflineAudioContext not available in workers)
        (async () => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                audioDuration = audioBuffer.duration;
                audioCtx.close();

                // Extract channel data as transferable Float32Arrays
                const channels = Math.min(audioBuffer.numberOfChannels, 2);
                const channelData = [];
                const transferList = [];

                for (let i = 0; i < channels; i++) {
                    const data = audioBuffer.getChannelData(i).slice(); // Copy to new buffer
                    channelData.push(data);
                    transferList.push(data.buffer);
                }

                worker.postMessage({
                    type: 'START',
                    channelData,
                    sampleRate: audioBuffer.sampleRate,
                    numberOfChannels: channels,
                    length: audioBuffer.length,
                    config: { bitrate: 96000 }
                }, transferList);
            } catch (err) {
                clearTimeout(timeoutId);
                worker.terminate();
                reject(err);
            }
        })();
    });
}

/**
 * Audio Compression - Tier 2: FFmpeg WASM (AAC Fallback)
 */
async function compressAudioSoftware(file, onProgress = () => { }) {
    const ff = await getFFmpeg();
    const inputName = 'input' + getExtension(file.name);
    const outputName = 'output.mp4'; // Use MP4/AAC for fallback compatibility

    ff.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
    });

    await ff.writeFile(inputName, await fetchFile(file));

    // AAC Encoding
    await ff.exec([
        '-i', inputName,
        '-c:a', 'aac',
        '-b:a', '128k',   // Standard quality
        '-vn',            // No video
        '-y',
        outputName
    ]);

    const data = await ff.readFile(outputName);
    const blob = new Blob([data.buffer], { type: 'audio/mp4' });

    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);

    return {
        success: true,
        blob,
        extension: 'm4a',
        mimeType: 'audio/mp4'
    };
}

/**
 * Smart compress audio with 2-tier fallback
 */
export async function compressAudio(file, onProgress = () => { }) {
    const originalSize = file.size;

    // Skip if already small or already optimized formats
    if (originalSize < SKIP_THRESHOLDS.audio ||
        file.type === 'audio/webm' ||
        file.type === 'audio/ogg') {
        return { file, originalSize, compressedSize: originalSize, skipped: true };
    }

    let result, method = 'unknown';

    try {
        // Strategy 1: WebCodecs (Fastest)
        console.log('[SmartCompress] Audio Strategy 1: WebCodecs (Opus/Ogg)');
        try {
            result = await compressAudioWebCodecs(file, onProgress);
            method = 'webcodecs';
        } catch (e) {
            console.warn('[SmartCompress] WebCodecs Audio failed, fallback:', e);
            result = { success: false };
        }

        if (!result.success) {
            // Strategy 2: FFmpeg (Robust)
            console.log('[SmartCompress] Audio Strategy 2: FFmpeg WASM');
            result = await compressAudioSoftware(file, onProgress);
            method = 'ffmpeg';
        }

        const validation = validateCompression(originalSize, result.blob.size, AUDIO_CONFIG.minSizeReduction);

        if (!validation.accept) {
            console.log(`[SmartCompress] Audio Skipped: ${validation.reason}`);
            return { file, originalSize, compressedSize: originalSize, skipped: true };
        }

        const newName = file.name.replace(/\.[^.]+$/, `.${result.extension}`);
        const compressedFile = new File([result.blob], newName, {
            type: result.mimeType,
            lastModified: Date.now()
        });

        console.log(`[SmartCompress] Audio Done (${method}): ${validation.reduction}% reduction`);
        return {
            file: compressedFile,
            originalSize,
            compressedSize: result.blob.size,
            skipped: false,
            method,
            reduction: validation.reduction,
            duration: result.duration // Include duration in the final result
        };

    } catch (error) {
        console.error('[SmartCompress] Audio Failed:', error);
        return { file, originalSize, compressedSize: originalSize, skipped: true, error };
    }
}

// =============================================================================
// AUTO-DETECT AND COMPRESS
// =============================================================================

/**
 * Auto-detect media type and compress accordingly
 * @param {File} file - Any media file
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{file: File, originalSize: number, compressedSize: number, type: string}>}
 */
export async function compressMedia(file, onProgress = () => { }, options = {}) {
    const type = file.type;

    if (type.startsWith('image/')) {
        const result = await compressImage(file, options);
        return { ...result, type: 'image' };
    }

    if (type.startsWith('video/')) {
        const result = await compressVideo(file, onProgress);
        return { ...result, type: 'video' };
    }

    if (type.startsWith('audio/')) {
        const result = await compressAudio(file, onProgress);
        return { ...result, type: 'audio' };
    }

    // Return as-is for other file types (documents, etc.)
    return {
        file,
        originalSize: file.size,
        compressedSize: file.size,
        skipped: true,
        type: 'other',
    };
}

// =============================================================================
// UTILITIES
// =============================================================================

function getExtension(filename) {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0] : '';
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Get image dimensions efficiently
 * @param {File|Blob|string} source - File, Blob, or URL string
 * @returns {Promise<{width: number, height: number}>}
 */
export function getImageDimensions(source) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
            // Clean up if it was a blob URL we created inside
            if (typeof source !== 'string') {
                URL.revokeObjectURL(img.src);
            }
        };
        img.onerror = (err) => reject(err);

        if (typeof source === 'string') {
            img.src = source;
        } else {
            img.src = URL.createObjectURL(source);
            // We need to revoke this later if we created it
        }
    });
}

/**
 * Get video dimensions from File or URL
 * @param {File|string} source - Video file or URL
 * @returns {Promise<{width: number, height: number}>}
 */
export function getVideoDimensions(source) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = () => {
            resolve({ width: video.videoWidth, height: video.videoHeight });
            // Clean up blob URL if we created it
            if (typeof source !== 'string') {
                URL.revokeObjectURL(video.src);
            }
            video.src = '';
            video.removeAttribute('src');
        };
        video.onerror = (err) => {
            reject(err);
            if (typeof source !== 'string') {
                URL.revokeObjectURL(video.src);
            }
        };

        if (typeof source === 'string') {
            video.src = source;
        } else {
            video.src = URL.createObjectURL(source);
        }
    });
}
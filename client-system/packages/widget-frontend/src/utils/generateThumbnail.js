/**
 * Thumbnail Generation Utility
 *
 * Generates a resized JPEG thumbnail from a File or Blob using HTML5 Canvas.
 * Maintains aspect ratio within specified bounds.
 * Returns object with blob and dimensional metadata.
 */
import { acquireBlobUrl, releaseBlobUrl } from '@/hooks/useObjectUrl';
import { MEDIA_LAYOUT } from '@/utils/mediaLayoutUtils';

export const generateThumbnail = async (
  fileOrBlob,
  maxWidth = MEDIA_LAYOUT.MAX_WIDTH,
  maxHeight = MEDIA_LAYOUT.MAX_HEIGHT,
) => {
  if (!fileOrBlob) return null;

  let src;
  let shouldRevoke = false;

  // Handle File/Blob vs URL string
  if (fileOrBlob instanceof Blob || fileOrBlob instanceof File) {
    // Use Global Registry to avoid creating a new URL if one exists
    // This prevents duplicate blob: URLs showing up in network/memory
    src = acquireBlobUrl(fileOrBlob);
    shouldRevoke = true;
  } else if (typeof fileOrBlob === 'string') {
    src = fileOrBlob;
  } else {
    return null;
  }

  try {
    const img = new Image();
    img.src = src;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const originalWidth = img.width;
    const originalHeight = img.height;

    let width = originalWidth;
    let height = originalHeight;

    const scale = Math.min(maxWidth / width, maxHeight / height);

    // Calculate new dimensions
    if (scale < 1) {
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    } else {
      // Even if smaller, we might want to standardize format to JPEG
      // But if it's already small, maybe just keep dimensions
      width = Math.round(width);
      height = Math.round(height);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // High quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, 0, 0, width, height);

    return new Promise((resolve) => {
      // Compress to JPEG 85% (High Quality, Standard)
      canvas.toBlob(
        (blob) => {
          resolve({
            blob,
            width, // Thumbnail width
            height, // Thumbnail height
            originalWidth, // Original image width
            originalHeight, // Original image height
          });
        },
        'image/jpeg',
        0.85,
      );
    });
  } catch {
    return null;
  } finally {
    if (shouldRevoke) releaseBlobUrl(fileOrBlob instanceof Blob ? fileOrBlob : null);
  }
};

/**
 * Generates a thumbnail from a video URL or Blob using a hidden video element.
 * Seeks to 0.1s to capture the first frame.
 */
export const generateVideoThumbnail = async (videoUrlOrBlob) => {
  return new Promise((resolve) => {
    let videoUrl;
    let shouldRevoke = false;

    if (videoUrlOrBlob instanceof Blob || videoUrlOrBlob instanceof File) {
      videoUrl = acquireBlobUrl(videoUrlOrBlob);
      shouldRevoke = true;
    } else {
      videoUrl = videoUrlOrBlob;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    // Important: video must be CORS enabled to draw to canvas without tainting
    video.crossOrigin = 'anonymous';

    // Timeout to prevent hanging if video is corrupt or missing metadata (MOOV atom at end)
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (shouldRevoke) releaseBlobUrl(videoUrlOrBlob instanceof Blob ? videoUrlOrBlob : null);
    };

    let duration = 0;

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        duration = video.duration;
      }
    };

    video.onloadeddata = () => {
      // Seek to 1.0s or 25% of video to avoid black frames at start
      // Use Math.min to ensure we don't seek past end
      const seekTime = Math.min(1.0, video.duration > 0 ? video.duration * 0.25 : 0);
      video.currentTime = seekTime || 0.1; // Fallback to 0.1
    };

    video.onseeked = () => {
      const originalWidth = video.videoWidth;
      const originalHeight = video.videoHeight;

      let width = originalWidth;
      let height = originalHeight;

      // Reuse resizing logic
      const maxWidth = MEDIA_LAYOUT.MAX_WIDTH;
      const maxHeight = MEDIA_LAYOUT.MAX_HEIGHT;
      const scale = Math.min(maxWidth / width, maxHeight / height);

      if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Updates duration if available (it might have updated since loadedmetadata)
      if (Number.isFinite(video.duration)) {
        duration = video.duration;
      }

      // Robust Check: Ensure duration is a valid finite number
      if (!Number.isFinite(duration) || Number.isNaN(duration)) {
        duration = 0;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // Draw scaled
      ctx.drawImage(video, 0, 0, width, height);

      // OPTIMIZATION: Use toBlob instead of toDataURL
      canvas.toBlob(
        (blob) => {
          cleanup();

          // Return full metadata object matching image structure
          resolve({
            blob,
            width,
            height,
            originalWidth,
            originalHeight,
            duration,
          });
        },
        'image/jpeg',
        0.7,
      );
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    video.src = videoUrl;
  });
};

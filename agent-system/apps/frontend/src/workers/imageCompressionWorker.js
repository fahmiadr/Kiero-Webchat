/**
 * Image Compression Web Worker
 * 
 * Offloads heavy image processing to a separate thread using OffscreenCanvas.
 * This keeps the main UI thread responsive during compression.
 */

self.onmessage = async (e) => {
    const { imageData, config, originalSize, originalWidth, originalHeight } = e.data;

    try {
        // Use the transferred ImageBitmap directly
        // Note: imageData is already an ImageBitmap transferred from main thread
        const bitmap = imageData;

        let width = bitmap.width;
        let height = bitmap.height;
        const aspectRatio = width / height;

        // Extreme aspect ratio detection (documents, receipts)
        const isExtremeAspectRatio = aspectRatio > 3 || aspectRatio < 0.33;
        const effectiveMaxDimension = isExtremeAspectRatio
            ? Math.max(config.maxDimension, 2400)
            : config.maxDimension;

        // Calculate new dimensions
        if (width > effectiveMaxDimension || height > effectiveMaxDimension) {
            const ratio = Math.min(
                effectiveMaxDimension / width,
                effectiveMaxDimension / height
            );
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        // Respect minimum dimension floor
        const minDim = Math.min(width, height);
        if (minDim < config.minDimension && originalWidth >= config.minDimension && originalHeight >= config.minDimension) {
            width = originalWidth;
            height = originalHeight;
        }

        // Use OffscreenCanvas for worker-based rendering
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);

        // Convert to blob with specified quality
        const quality = config.qualityTiers?.high || 0.90;
        const blob = await canvas.convertToBlob({
            type: config.mimeType || 'image/webp',
            quality: quality
        });

        // Validate compression benefit
        const reduction = 1 - (blob.size / originalSize);
        const minReduction = config.minSizeReduction || 0.15;

        if (reduction <= 0 || reduction < minReduction) {
            // Compression not beneficial
            self.postMessage({
                success: true,
                skipped: true,
                reason: reduction <= 0 ? 'no_reduction' : 'minimal_reduction',
                reduction: Math.round(reduction * 100),
                width: originalWidth,
                height: originalHeight
            });
            return;
        }

        // Success - transfer the blob back
        self.postMessage({
            success: true,
            skipped: false,
            blob: blob,
            quality: quality,
            reduction: Math.round(reduction * 100),
            width: width,
            height: height
        });

    } catch (error) {
        self.postMessage({
            success: false,
            error: error.message
        });
    }
};

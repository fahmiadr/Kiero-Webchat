/**
 * Media Layout Utilities
 * 
 * WhatsApp-style constrained dimensions for chat media (images, videos).
 * Ensures zero layout shift and consistent sizing across all states.
 */

// =============================================================================
// Layout Constants (WhatsApp Industry Standard)
// =============================================================================
export const MEDIA_LAYOUT = {
    MAX_WIDTH: 320,   // Maximum width for chat bubble
    MAX_HEIGHT: 320,  // Maximum height constraint
    MIN_WIDTH: 240,   // Minimum visible width
    MIN_HEIGHT: 80,   // Minimum visible height
};

/**
 * Calculate WhatsApp-style constrained dimensions and object-fit mode.
 * 
 * Logic:
 * - Normal media: object-contain (full media visible)
 * - Extreme tall/narrow: object-cover (crop to fill min-width)
 * - Extreme short/wide: object-cover (crop to fill min-height)
 * 
 * @param {Object} meta - Metadata with width and height
 * @param {number} meta.width - Original width
 * @param {number} meta.height - Original height
 * @param {string} fallbackType - Type of media for fallback ratio if meta is missing ('image'|'video'|'document')
 * @returns {{ containerStyle: Object|undefined, objectFit: string }}
 */
export function calculateLayoutConfig(meta, defaultObjectFit = 'contain', fallbackType = 'image') {
    const { MAX_WIDTH, MAX_HEIGHT, MIN_WIDTH, MIN_HEIGHT } = MEDIA_LAYOUT;

    if (!meta?.width || !meta?.height) {
        // Fallback Layout Pattern to prevent Cumulative Layout Shift
        let fallbackWidth = MAX_WIDTH;
        let fallbackHeight = Math.round(MAX_WIDTH * 0.75); // 4:3 default for images

        if (fallbackType === 'video') {
            fallbackHeight = Math.round(MAX_WIDTH * 0.5625); // 16:9 default for video
        } else if (fallbackType === 'document' || fallbackType === 'audio') {
            // Documents and audio typically have fixed CSS styling, but strictly mathematically:
            // We usually don't use this function for them, but returning undefined is safer.
            return { containerStyle: undefined, objectFit: defaultObjectFit };
        }

        return {
            containerStyle: {
                width: `${fallbackWidth}px`,
                height: `${fallbackHeight}px`,
                aspectRatio: `${fallbackWidth} / ${fallbackHeight}`
            },
            // Cover ensures any loading spinner/placeholder fills the space completely
            objectFit: 'cover'
        };
    }

    const originalWidth = meta.width;
    const originalHeight = meta.height;

    // Calculate scale factor (fit within bounds)
    const scaleByWidth = MAX_WIDTH / originalWidth;
    const scaleByHeight = MAX_HEIGHT / originalHeight;
    const scale = Math.min(scaleByWidth, scaleByHeight);

    let displayWidth = Math.round(originalWidth * scale);
    let displayHeight = Math.round(originalHeight * scale);

    // Detect extreme aspect ratios
    const isTooNarrow = displayWidth < MIN_WIDTH;  // Very tall media
    const isTooShort = displayHeight < MIN_HEIGHT; // Very wide media

    let objectFit = 'contain'; // Default: show full media

    if (isTooNarrow) {
        // Tall/narrow: force min-width, crop height
        displayWidth = MIN_WIDTH;
        displayHeight = MAX_HEIGHT;
        objectFit = 'cover';
    } else if (isTooShort) {
        // Short/wide: force min-height, crop width
        displayWidth = MAX_WIDTH;
        displayHeight = MIN_HEIGHT;
        objectFit = 'cover';
    }

    return {
        containerStyle: {
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            aspectRatio: `${displayWidth} / ${displayHeight}`
        },
        objectFit
    };
}

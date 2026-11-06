/**
 * LocationAttachment - Displays a location message with optional map preview.
 * Matches the widget-frontend layout (map image + info section) while using
 * dynamic attachmentStyles from roleStyles.js for consistent theming.
 *
 * Features:
 * - Google Static Maps preview (if API key is available)
 * - Fallback pin icon when no API key or image fails
 * - Parsed address + coordinates display
 * - Hover zoom animation on map
 * - Dynamic dark-mode colors via attachmentStyles prop
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { MEDIA_LAYOUT } from '@/utils/mediaLayoutUtils';

// Default dark-mode attachment styles
const DEFAULT_STYLES = {
    container: 'bg-white/5 border-white/10',
    icon: 'text-white/60',
    text: 'text-white/90',
    meta: 'text-white/50',
    hover: 'hover:bg-white/10',
};

const LocationAttachment = memo(({ src, address: propAddress, className = '', attachmentStyles, onResize }) => {
    const styles = { ...DEFAULT_STYLES, ...attachmentStyles };

    const [mapUrl, setMapUrl] = useState(null);
    const [coordinates, setCoordinates] = useState(null);
    const [address, setAddress] = useState(null);
    const [hasError, setHasError] = useState(false);

    // Report fixed width to parent for dynamic bubble sizing (fires once on mount)
    const reportedRef = useRef(false);
    const handleRef = useCallback((node) => {
        if (node && onResize && !reportedRef.current) {
            onResize(MEDIA_LAYOUT.MAX_WIDTH);
            reportedRef.current = true;
        }
    }, [onResize]);

    // Parse Google Maps URL to extract lat/lng and optionally build a static map image
    useEffect(() => {
        try {
            const urlObj = new URL(src);
            const params = new URLSearchParams(urlObj.search);
            const q = params.get('q');

            if (q) {
                const parts = q.split(',');
                if (parts.length >= 2) {
                    const lat = parseFloat(parts[0]);
                    const lng = parseFloat(parts[1].split(' ')[0]); // Handle potential label suffix

                    if (!isNaN(lat) && !isNaN(lng)) {
                        setCoordinates({ lat, lng });
                        setAddress(propAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`);

                        // Build static map image if API key is available
                        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
                        if (apiKey) {
                            const staticMap = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=600x200&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
                            setMapUrl(staticMap);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to parse location URL:', e);
            setHasError(true);
        }
    }, [src, propAddress]);

    return (
        <a
            ref={handleRef}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            style={{ width: '100%', maxWidth: `${MEDIA_LAYOUT.MAX_WIDTH}px` }}
            className={`block rounded-xl overflow-hidden transition-all group ${className}`}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Map Preview */}
            <div className="relative h-32 w-full overflow-hidden bg-black/20">
                {mapUrl && !hasError ? (
                    <img
                        src={mapUrl}
                        alt="Location Map"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        onError={() => setHasError(true)}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                        <MapPin className={`w-8 h-8 ${styles.icon}`} />
                    </div>
                )}

                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>

            {/* Info Section */}
            <div className="p-3">
                <h4 className={`text-sm font-semibold leading-tight line-clamp-2 m-0 ${styles.text}`}>
                    {address || 'Lokasi Terpilih'}
                </h4>
                <p className={`text-xs mt-0.5 truncate font-mono m-0 ${styles.meta}`}>
                    {coordinates
                        ? `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`
                        : 'Memuat koordinat...'}
                </p>
            </div>
        </a>
    );
});

export default LocationAttachment;

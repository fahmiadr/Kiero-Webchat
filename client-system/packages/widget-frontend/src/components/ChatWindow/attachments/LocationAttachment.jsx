import { MapPin } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from '@/hooks/useInView';
import { MEDIA_LAYOUT } from '@/utils/mediaLayoutUtils';

const LocationAttachment = memo(({ src, address: propAddress, className = '', onResize }) => {
  const [mapUrl, setMapUrl] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [address, setAddress] = useState(null);
  const [hasError, setHasError] = useState(false);
  const { ref, isInView } = useInView({ triggerOnce: true, rootMargin: '200px' });

  // Parse Google Maps URL from src
  // Expected format: https://www.google.com/maps?q=lat,lng
  useEffect(() => {
    if (!isInView) return;

    try {
      const urlObj = new URL(src);
      const params = new URLSearchParams(urlObj.search);
      const q = params.get('q');

      if (q) {
        // q can be "lat,lng" or "lat,lng+(Label)"
        const parts = q.split(',');
        if (parts.length >= 2) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1].split(' ')[0]); // Handle potential label

          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            setCoordinates({ lat, lng });

            // Priority: propAddress > URL Label > Coords
            setAddress(propAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`);

            const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
            if (apiKey) {
              const staticMap = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=600x200&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
              setMapUrl(staticMap);
            }
          }
        }
      }
    } catch {
      setHasError(true);
    }
  }, [src, propAddress, isInView]);
  const reportedRef = useRef(false);

  const handleRef = useCallback(
    (node) => {
      // useInView returns a useRef object, not a function
      ref.current = node;
      if (node && onResize && !reportedRef.current) {
        onResize(MEDIA_LAYOUT.MAX_WIDTH);
        reportedRef.current = true;
      }
    },
    [ref, onResize],
  );

  return (
    <a
      ref={handleRef}
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      style={{ width: '100%', maxWidth: `${MEDIA_LAYOUT.MAX_WIDTH}px` }}
      className={`group block overflow-hidden rounded-xl shadow-sm transition-all hover:shadow-md ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Map Preview */}
      <div className="relative h-32 w-full overflow-hidden bg-slate-100">
        {mapUrl && !hasError ? (
          <img
            src={mapUrl}
            alt="Location Map"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => setHasError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5">
            <MapPin className="h-8 w-8 opacity-30" />
          </div>
        )}

        {/* Overlay Gradient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
      </div>

      {/* Info Section */}
      <div className="p-3">
        <h4 className="line-clamp-2 font-semibold text-sm leading-tight opacity-90">
          {address || 'Lokasi Terpilih'}
        </h4>
        <p className="mt-0.5 truncate font-mono text-xs opacity-60">
          {coordinates
            ? `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`
            : 'Memuat koordinat...'}
        </p>
      </div>
    </a>
  );
});

export default LocationAttachment;

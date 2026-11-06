import { useEffect, useRef } from 'react';

// Internal component for User Location Marker using AdvancedMarkerElement
const UserLocationMarker = ({ map, position }) => {
  const markerRef = useRef(null);

  // Initialize marker when map is ready
  useEffect(() => {
    if (!map) return;
    if (!window.google?.maps?.marker?.AdvancedMarkerElement) return;

    const dot = document.createElement('div');
    dot.style.width = '16px';
    dot.style.height = '16px';
    dot.style.backgroundColor = '#4285F4';
    dot.style.borderRadius = '50%';
    dot.style.border = '2px solid white';
    dot.style.boxShadow = '0 0 4px rgba(0,0,0,0.3)';
    dot.style.position = 'relative';

    const ring = document.createElement('div');
    ring.style.position = 'absolute';
    ring.style.top = '50%';
    ring.style.left = '50%';
    ring.style.width = '100%';
    ring.style.height = '100%';
    ring.style.borderRadius = '50%';
    ring.style.backgroundColor = 'rgba(66, 133, 244, 0.4)';
    ring.style.transform = 'translate(-50%, -50%)';

    ring.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(2.5)', opacity: 0 },
      ],
      {
        duration: 2000,
        iterations: Infinity,
      },
    );

    dot.appendChild(ring);

    try {
      markerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        map,
        content: dot,
        title: 'Lokasi Anda',
      });
    } catch (error) {
      console.warn('Gagal memuat penanda Google Maps (mungkin API Key invalid):', error);
      // Fallback: jangan crash jika Maps tidak terinisialisasi
      return;
    }

    return () => {
      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }
    };
  }, [map]);

  // Update position when it changes
  useEffect(() => {
    if (markerRef.current && position) {
      markerRef.current.position = position;
    }
  }, [position]);

  return null;
};

export default UserLocationMarker;

import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { Debouncer } from '@tanstack/pacer';
import { m } from 'framer-motion';
import { Loader2, Locate, MapPin, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import LocationCard from './LocationCard';
import UserLocationMarker from './UserLocationMarker';

const libraries = ['marker'];

const containerStyle = {
  width: '100%',
  height: '100%',
};

const LocationPicker = ({ onClose, onSendLocation }) => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
    language: 'id',
    region: 'ID',
  });

  const [map, setMap] = useState(null);
  const [center, setCenter] = useState(null); // Initialize as null
  const [isPickingMode, setIsPickingMode] = useState(false);
  const [isMapMoving, setIsMapMoving] = useState(false); // Track map movement for animation

  // Current Location State
  const [currentLocation, setCurrentLocation] = useState({
    lat: null,
    lng: null,
    address: null,
    loading: true,
    error: null, // 'PERMISSION_DENIED', 'POSITION_UNAVAILABLE', 'TIMEOUT', 'UNKNOWN'
  });

  const [selectedLocation, setSelectedLocation] = useState({
    lat: null,
    lng: null,
    address: null,
    loading: false,
    error: null,
  });
  const geocoderRef = useRef(null);
  // Wrap geocodePosition in useCallback to avoid changing references on every render
  const geocodePosition = useCallback(
    (pos, callback) => {
      if (!isLoaded || !window.google?.maps?.Geocoder) {
        callback(null, 'MAPS_NOT_READY');
        return;
      }

      if (!geocoderRef.current) {
        geocoderRef.current = new window.google.maps.Geocoder();
      }

      geocoderRef.current.geocode({ location: pos }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const scaledAddress = results[0].formatted_address;
          callback(scaledAddress, null);
        } else {
          callback(null, status);
        }
      });
    },
    [isLoaded],
  );

  // Refs for Debounce State to avoid stale closures
  const latestCoordsRef = useRef(null);
  const debouncerRef = useRef(null);

  // Maintain a ref to the latest fetch logic to avoid stale closures in the debouncer
  const fetchRef = useRef(null);

  // Update ref on every render with fresh scope (isLoaded, geocodePosition)
  fetchRef.current = (coords) => {
    setIsMapMoving(false); // Drop the pin (Animation)

    // Reset ALL state when debounce fires — coords, loading, address, error
    setSelectedLocation({
      lat: coords.lat,
      lng: coords.lng,
      address: null,
      loading: true,
      error: null,
    });

    geocodePosition(coords, (addr, err) => {
      setSelectedLocation((prev) => ({
        ...prev,
        address: addr,
        loading: false,
        error: err ? 'GEOCODING_FAILED' : null,
      }));
    });
  };

  // Initialize Debouncer once
  useEffect(() => {
    // Pacer Debouncer: Waits for user to stop moving map before fetching
    debouncerRef.current = new Debouncer(
      () => {
        const coords = latestCoordsRef.current;
        if (!coords) return;

        // Use fetchRef to ensure we have the latest function closure
        if (fetchRef.current) {
          fetchRef.current(coords);
        }
      },
      { wait: 800 },
    ); // 800ms natural pause

    return () => {
      debouncerRef.current?.cancel();
    };
  }, []);

  const getCurrentLocation = useCallback(() => {
    setCurrentLocation((prev) => ({ ...prev, loading: true, error: null }));

    if (!navigator.geolocation) {
      setCurrentLocation((prev) => ({ ...prev, loading: false, error: 'NOT_SUPPORTED' }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentLocation({
          ...pos,
          address: null, // Will fetch address next
          loading: true, // Keep loading for address
          error: null,
        });

        // If map is ready, re-center
        if (map && !isPickingMode) {
          map.panTo(pos);
        } else if (!map) {
          setCenter(pos); // Set initial map center
        }

        // Reverse Geocode Current Location
        geocodePosition(pos, (addr, err) => {
          setCurrentLocation((prev) => ({
            ...prev,
            address: addr,
            loading: false,
            error: err ? 'GEOCODING_FAILED' : null,
          }));
        });
      },
      (err) => {
        let errorType = 'UNKNOWN';
        if (err.code === 1) errorType = 'PERMISSION_DENIED';
        else if (err.code === 2) errorType = 'POSITION_UNAVAILABLE';
        else if (err.code === 3) errorType = 'TIMEOUT';

        setCurrentLocation((prev) => ({ ...prev, loading: false, error: errorType }));
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }, [map, isPickingMode, geocodePosition]);

  // Initial Load: Get Current Location
  useEffect(() => {
    if (isLoaded) {
      getCurrentLocation();
    }
  }, [isLoaded, getCurrentLocation]);

  const onLoad = useCallback(function callback(map) {
    setMap(map);
    geocoderRef.current = new window.google.maps.Geocoder();
  }, []);

  const onUnmount = useCallback(function callback(_map) {
    setMap(null);
  }, []);

  // Handle Map Movement (Drag/Zoom) Start
  // We use onDragStart AND onZoomChanged to detect movement
  const handleMapMoveStart = useCallback(() => {
    debouncerRef.current?.cancel(); // Cancel pending fetch
    if (isPickingMode) setIsMapMoving(true);
  }, [isPickingMode]);

  // Handle Map Idle (Drag End / Zoom End)
  // This fires when the map stops moving for any reason (pan, zoom, resize)
  const handleIdle = useCallback(() => {
    if (!map || !geocoderRef.current || !isPickingMode) return;

    // Only proceed if we were moving (or if it's the initial idle)
    // But onIdle fires initially too. We want to avoid double fetch if possible,
    // though the debouncer handles most of it.

    const newCenter = map.getCenter();
    const lat = newCenter.lat();
    const lng = newCenter.lng();

    // Only store coords in ref — state update deferred to debounce callback
    latestCoordsRef.current = { lat, lng };

    // Trigger Debouncer directly
    debouncerRef.current?.maybeExecute();
  }, [map, isPickingMode]);

  // Fetch initial address when entering pick mode
  useEffect(() => {
    if (map && isPickingMode) {
      // Initial selected location address fetch if null
      if (!selectedLocation.address && !selectedLocation.loading) {
        const c = map.getCenter();
        const initialPick = { lat: c.lat(), lng: c.lng() };
        setSelectedLocation((prev) => ({ ...prev, ...initialPick, loading: true }));
        geocodePosition(initialPick, (addr, err) => {
          setSelectedLocation((prev) => ({
            ...prev,
            address: addr,
            loading: false,
            error: err ? 'GEOCODING_FAILED' : null,
          }));
        });
      }
    }
  }, [map, isPickingMode, selectedLocation.address, selectedLocation.loading, geocodePosition]);

  const handleSendLocation = (loc) => {
    if (!loc.lat || !loc.lng) return;

    onSendLocation({
      latitude: loc.lat,
      longitude: loc.lng,
      address: loc.address || `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`,
    });

    onClose();
  };

  const activatePickMode = () => {
    setIsPickingMode(true);
    if (map) {
      const c = map.getCenter();
      setSelectedLocation((prev) => ({
        ...prev,
        lat: c.lat(),
        lng: c.lng(),
        address: null,
        loading: true,
      }));
      // Trigger geocode for center
      geocodePosition({ lat: c.lat(), lng: c.lng() }, (addr, err) => {
        setSelectedLocation((prev) => ({
          ...prev,
          address: addr,
          loading: false,
          error: err ? 'GEOCODING_FAILED' : null,
        }));
      });
    }
  };

  const returnToCurrent = () => {
    if (currentLocation.lat && currentLocation.lng) {
      setIsPickingMode(false);
      map?.panTo({ lat: currentLocation.lat, lng: currentLocation.lng });
    } else {
      getCurrentLocation(); // Retry if we don't have it
    }
  };

  // --- RENDER HELPERS ---

  // Generic Error View for Map Loading Failures
  if (loadError || !import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="fade-in zoom-in-95 fixed inset-0 z-[100] flex animate-in flex-col items-center justify-center bg-white p-6 text-center duration-200">
        <div className="mb-4 rounded-full bg-gray-50 p-4 text-gray-400">
          <MapPin className="h-10 w-10" />
        </div>
        <h3 className="mb-2 font-semibold text-gray-900 text-lg">Layanan Peta Tidak Tersedia</h3>
        <p className="mx-auto mb-8 max-w-xs text-gray-500 text-sm">
          Mohon maaf, terjadi gangguan pada layanan peta. Silakan coba beberapa saat lagi.
        </p>
        <Button onClick={onClose} variant="outline" size="lg" className="w-full max-w-xs">
          Tutup
        </Button>
      </div>
    );
  }

  return (
    <div className="slide-in-from-bottom-5 absolute inset-0 z-[50] flex animate-in touch-none select-none flex-col bg-white duration-300">
      {/* Header */}
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 flex items-center justify-between p-4">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="pointer-events-auto h-9 w-9 shrink-0 rounded-full bg-white/90 text-slate-800 shadow-sm hover:bg-white"
            >
              <X className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Tutup</p>
          </TooltipContent>
        </Tooltip>
        <div className="pointer-events-auto mx-2 max-w-[50%] select-none truncate rounded-full border bg-white/90 px-4 py-2 shadow-sm backdrop-blur">
          <h3 className="truncate font-semibold text-gray-800 text-sm">
            {isPickingMode ? 'Pilih Lokasi Manual' : 'Lokasi Anda'}
          </h3>
        </div>
        {/* Return to User Location (Top Right) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="pointer-events-auto h-10 w-10 shrink-0 rounded-full border bg-white/90 text-gray-700 shadow-md backdrop-blur hover:bg-white"
              onClick={returnToCurrent}
            >
              <Locate className={`h-5 w-5 ${isPickingMode ? 'text-gray-500' : 'text-blue-600'}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Kembali ke Lokasi Anda</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Map Area */}
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center bg-gray-50">
        {(!isLoaded || !center) && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="font-medium text-gray-500 text-sm">Memuat Peta...</p>
          </div>
        )}

        {isLoaded && center && (
          <>
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={center}
              zoom={16}
              onLoad={onLoad}
              onUnmount={onUnmount}
              onDragStart={handleMapMoveStart}
              onZoomChanged={handleMapMoveStart} // Detect zoom start
              onIdle={handleIdle} // Detect end of movement (pan or zoom)
              options={{
                disableDefaultUI: true,
                draggable: isPickingMode, // Only draggable in pick mode
                gestureHandling: isPickingMode ? 'greedy' : 'none',
                mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
              }}
            >
              {/* User Marker: Always shows if we have location */}
              {currentLocation.lat && (
                <UserLocationMarker
                  map={map}
                  position={{ lat: currentLocation.lat, lng: currentLocation.lng }}
                />
              )}
            </GoogleMap>

            {isPickingMode && (
              <div className="pointer-events-none absolute top-1/2 left-1/2 z-0">
                {/* Shadow - Render first so it's behind the pin */}
                <m.div
                  initial={{ x: '-50%', y: '-50%' }}
                  animate={
                    isMapMoving
                      ? { scale: 0.8, opacity: 0.4, x: '-50%', y: '-50%' }
                      : { scale: 1, opacity: 0.7, x: '-50%', y: '-50%' }
                  }
                  className="absolute top-0 left-1/2 h-1.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-black/30 blur-[1px]"
                ></m.div>

                {/* Pin - Anchor bottom center to the map center */}
                <m.div
                  initial={{ y: -12, scale: 0.1, x: '-50%' }}
                  animate={
                    isMapMoving
                      ? { scale: 1.1, y: -12, x: '-50%' }
                      : { scale: 1, y: -12, x: '-50%' }
                  }
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="absolute bottom-0 left-1/2 origin-bottom -translate-x-1/2"
                >
                  <m.div
                    animate={isMapMoving ? { y: 0 } : { y: [0, -6, 0] }}
                    transition={
                      isMapMoving
                        ? {}
                        : {
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            repeatDelay: 1,
                          }
                    }
                    className="relative"
                  >
                    {/* 3D Pin Body: Rotate 45deg clockwise so the Bottom-Right corner points DOWN */}
                    <div className="flex h-8 w-8 rotate-45 transform items-center justify-center rounded-full rounded-br-none border-[3px] border-white bg-gradient-to-br from-red-500 to-red-700 shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.2),2px_4px_8px_rgba(0,0,0,0.3)]">
                      {/* Inner Hole */}
                      <div className="h-3 w-3 rounded-full bg-white shadow-inner"></div>
                    </div>
                  </m.div>
                </m.div>
              </div>
            )}

            {/* Control Buttons (Bottom Right - Only Pick Manual) */}
            <div className="pointer-events-none absolute right-4 bottom-6 z-10 flex flex-col gap-2">
              {/* Button to toggle Pick Mode */}
              {isPickingMode ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsPickingMode(false);
                    returnToCurrent();
                  }}
                  className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-gray-100 bg-white px-4 font-medium text-gray-700 text-xs shadow-lg hover:bg-gray-50"
                >
                  <X className="h-4 w-4 text-gray-500" />
                  Batal
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={activatePickMode}
                  className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-gray-100 bg-white px-4 font-medium text-gray-700 text-xs shadow-lg hover:bg-gray-50"
                >
                  <MapPin className="h-4 w-4 text-red-600" />
                  Pilih Manual
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <LocationCard
        isPickingMode={isPickingMode}
        currentLocation={currentLocation}
        selectedLocation={selectedLocation}
        onSendLocation={handleSendLocation}
        onGetCurrentLocation={getCurrentLocation}
        map={map}
        geocodePosition={geocodePosition}
        setSelectedLocation={setSelectedLocation}
      />
    </div>
  );
};

export default LocationPicker;

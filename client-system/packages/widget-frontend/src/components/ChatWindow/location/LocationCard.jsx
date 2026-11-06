import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const LocationCard = ({
  isPickingMode,
  currentLocation,
  selectedLocation,
  onSendLocation,
  onGetCurrentLocation,
  map,
  geocodePosition,
  setSelectedLocation,
}) => {
  const target = isPickingMode ? selectedLocation : currentLocation;

  return (
    <div className="z-20 shrink-0 select-none border-gray-200 border-t bg-white p-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      {/* Dynamic Location Card */}
      <Card
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!target.loading && !target.error) {
              onSendLocation(target);
            }
          }
        }}
        onClick={() => {
          if (!target.loading && !target.error) {
            onSendLocation(target);
          }
        }}
        className={`flex w-full cursor-pointer items-center justify-between overflow-hidden p-4 shadow-sm transition-all duration-300 active:scale-[0.99] ${
          isPickingMode
            ? 'border-red-200 bg-red-50/80 ring-2 ring-red-50/50 hover:bg-red-100/80'
            : 'border-blue-200 bg-blue-50/80 ring-2 ring-blue-50/50 hover:bg-blue-100/80'
        }`}
      >
        <div className="relative z-10 flex items-center gap-4">
          {/* Icon */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors duration-300 ${isPickingMode ? 'bg-red-200 text-red-700' : 'bg-blue-200 text-blue-700'}`}
          >
            {isPickingMode ? (
              <MapPin className="h-5 w-5 fill-current" />
            ) : (
              <Navigation className="h-5 w-5 fill-current" />
            )}
          </div>

          {/* Content Slot - Min height to prevent layout shift, grows for long addresses */}
          <div className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-0.5">
            {/* Label */}
            <p
              className={`flex items-center gap-2 font-bold text-[10px] uppercase tracking-wider transition-colors duration-300 ${isPickingMode ? 'text-red-700' : 'text-blue-700'}`}
            >
              {isPickingMode ? 'Kirim Lokasi Terpilih' : 'Kirim Lokasi Saat Ini'}
            </p>

            {/* Dynamic Content - All states render within same height and alignment */}
            {(() => {
              if (target.loading) {
                return (
                  <div className="flex w-full flex-col gap-1 pt-0.5">
                    <div
                      className={`h-4 w-3/4 animate-pulse rounded ${isPickingMode ? 'bg-red-200/60' : 'bg-blue-200/60'}`}
                    />
                    <div
                      className={`h-4 w-1/2 animate-pulse rounded ${isPickingMode ? 'bg-red-200/60' : 'bg-blue-200/60'}`}
                    />
                  </div>
                );
              }

              if (target.error) {
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: Prevent card click when clicking retry
                  <div
                    role="presentation"
                    className="flex items-center gap-2 pt-0.5"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <p className="flex-1 font-medium text-red-600 text-xs leading-tight">
                      {target.error === 'PERMISSION_DENIED' && 'Akses lokasi ditolak.'}
                      {target.error === 'TIMEOUT' && 'Gagal mendeteksi lokasi.'}
                      {target.error === 'POSITION_UNAVAILABLE' && 'Posisi tidak tersedia.'}
                      {target.error === 'GEOCODING_FAILED' && 'Gagal memuat alamat.'}
                      {target.error === 'UNKNOWN' && 'Terjadi kesalahan.'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPickingMode) {
                          if (map) {
                            const c = map.getCenter();
                            setSelectedLocation((prev) => ({
                              ...prev,
                              loading: true,
                              error: null,
                            }));
                            geocodePosition({ lat: c.lat(), lng: c.lng() }, (addr, err) => {
                              setSelectedLocation((prev) => ({
                                ...prev,
                                address: addr,
                                loading: false,
                                error: err ? 'GEOCODING_FAILED' : null,
                              }));
                            });
                          }
                        } else {
                          onGetCurrentLocation();
                        }
                      }}
                      className="h-7 shrink-0 border-red-200 bg-white px-2 text-red-700 text-xs hover:bg-red-50"
                    >
                      Retry
                    </Button>
                  </div>
                );
              }

              return (
                <div className="pt-0.5">
                  <p
                    className="line-clamp-2 break-words font-semibold text-gray-900 text-sm leading-snug"
                    title={target.address || `${target.lat?.toFixed(6)}, ${target.lng?.toFixed(6)}`}
                  >
                    {target.address || `${target.lat?.toFixed(6)}, ${target.lng?.toFixed(6)}`}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LocationCard;

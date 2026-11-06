import { AlertTriangle, Terminal } from 'lucide-react';
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import WidgetSimpleHeader from './WidgetSimpleHeader';

/**
 * ErrorWidget - Displays configuration or connection errors
 * Features:
 * - Uses standard Shadcn UI components
 * - Uses standard WidgetSimpleHeader
 * - Memoized for performance
 * - Localized for Indonesian users
 */
const ErrorWidget = memo(({ error, onClose, isMobile }) => {
  if (!error) return null;

  const getErrorTitle = (type) => {
    switch (type) {
      case 'Configuration Error':
        return 'Kesalahan Konfigurasi';
      case 'Runtime Error':
        return 'Kesalahan Sistem';
      case 'System Error':
        return 'Gangguan Teknis';
      default:
        return 'Terjadi Kesalahan';
    }
  };

  return (
    <Card
      className={`relative flex h-full w-full animate-fade-in flex-col overflow-hidden border border-red-500 bg-white shadow-2xl ${isMobile ? '' : 'rounded-xl'}
        `}
    >
      {/* Header Section */}
      <WidgetSimpleHeader
        title={getErrorTitle(error.type)}
        subtitle="System Diagnostic"
        onClose={onClose}
        isMobile={isMobile}
        variant="error"
        icon={<AlertTriangle className="h-4 w-4 text-white" />}
      />

      {/* Content: Technical Details */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Hero Icon */}
        <div className="shrink-0 px-6 pt-6 pb-2 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500 ring-8 ring-red-50/50">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div className="space-y-1.5">
            <CardDescription className="mx-auto max-w-[260px] text-center text-sm leading-relaxed">
              {error.message}
            </CardDescription>
          </div>
        </div>

        <CardContent className="min-h-0 w-full flex-1 px-6 py-2">
          <div className="flex h-full flex-col overflow-hidden rounded-lg border border-red-100/50 bg-red-50/30">
            <div className="flex shrink-0 items-center justify-between border-red-100/50 border-b bg-red-50/50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-red-400" />
                <span className="font-bold text-[10px] text-red-700 uppercase tracking-widest">
                  Debug Info
                </span>
              </div>
              <Badge
                variant="outline"
                className="h-5 border-red-200 bg-white px-1.5 font-mono text-[10px] text-red-600"
              >
                {error.type}
              </Badge>
            </div>

            <ScrollArea className="w-full flex-1">
              <div className="space-y-3 p-4">
                {error.context &&
                  Object.entries(error.context)
                    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
                    .map(([key, value], index) => (
                      <div key={key}>
                        {index > 0 && <Separator className="my-2 bg-red-100/50" />}
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-[10px] text-gray-400 uppercase tracking-wide">
                            {key}
                          </span>
                          <div className="break-all rounded border border-gray-100 bg-white px-2 py-1.5 font-mono text-gray-600 text-xs">
                            {value}
                          </div>
                        </div>
                      </div>
                    ))}
                {(!error.context ||
                  Object.values(error.context).filter(
                    (v) => v !== undefined && v !== null && v !== '',
                  ).length === 0) && (
                  <div className="flex h-full flex-col items-center justify-center py-4 text-center opacity-50">
                    <p className="text-gray-400 text-xs italic">
                      Tidak ada detail konteks tambahan.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </div>
    </Card>
  );
});

ErrorWidget.displayName = 'ErrorWidget';

export default ErrorWidget;

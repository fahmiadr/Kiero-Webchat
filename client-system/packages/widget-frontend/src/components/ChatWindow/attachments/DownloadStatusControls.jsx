import { AlertCircle, Play, X } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { CircularProgress } from '@/components/ui/circular-progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PROGRESS_COLORS } from '@/utils/roleStyles';

// ==========================================
// Size presets
// ==========================================
const SIZE_PRESETS = {
  sm: { ring: 24, icon: { width: '12px', height: '12px' }, button: 'w-6 h-6' },
  md: { ring: 32, icon: { width: '14px', height: '14px' }, button: 'w-8 h-8' },
};

/**
 * Shared download status controls for downloading/paused/error states.
 *
 * @param {object} props
 * @param {'downloading'|'paused'|'error'} props.status - Current download status
 * @param {number}  props.progress        - Download percentage (0-100)
 * @param {() => void} props.onCancel     - Cancel/pause download handler
 * @param {() => void} props.onResume     - Resume download handler
 * @param {() => void} props.onRetry      - Retry on error handler
 * @param {'sm'|'md'}  [props.size='sm']  - Size preset: sm (24px) or md (32px)
 * @param {boolean} [props.showPercentage=false] - Show percentage text next to progress
 * @param {'overlay'|'inline'} [props.variant='overlay'] - Color variant
 * @param {object}  [props.progressColors] - Custom progress colors { active, paused, pausedIcon }
 * @param {string}  [props.iconColor]      - Override icon color class for cancel icon
 * @param {boolean} [props.reverseLayout=false] - Swap percentage to left, button to right
 */
const DownloadStatusControls = memo(
  ({
    status,
    progress = 0,
    onCancel,
    onResume,
    onRetry,
    size = 'sm',
    showPercentage = false,
    variant = 'overlay',
    progressColors = PROGRESS_COLORS,
    iconColor,
    reverseLayout = false,
  }) => {
    const preset = SIZE_PRESETS[size] || SIZE_PRESETS.sm;
    const isOverlay = variant === 'overlay';

    // Icon color: overlay uses white, inline uses provided or defaults
    const cancelIconClass = iconColor || (isOverlay ? 'text-white' : 'text-current');
    const percentageClass = isOverlay
      ? 'text-white text-xs font-medium'
      : 'text-current text-xs font-medium';

    if (status === 'downloading') {
      return (
        <div className={`flex items-center gap-2 ${reverseLayout ? 'flex-row-reverse' : ''}`}>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={onCancel}
                className={`relative flex items-center justify-center ${preset.button} rounded-full border-0 bg-transparent p-0 hover:bg-transparent`}
              >
                <X className={`absolute ${cancelIconClass}`} style={preset.icon} />
                <CircularProgress
                  percentage={progress}
                  size={preset.ring}
                  color={progressColors?.active}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Jeda</TooltipContent>
          </Tooltip>
          {showPercentage && <span className={percentageClass}>{progress}%</span>}
        </div>
      );
    }

    if (status === 'paused') {
      return (
        <div className={`flex items-center gap-2 ${reverseLayout ? 'flex-row-reverse' : ''}`}>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={onResume}
                className={`relative flex items-center justify-center ${preset.button} rounded-full border-0 bg-transparent p-0 hover:bg-transparent`}
              >
                <Play
                  className={`absolute ${isOverlay ? 'fill-white text-white' : progressColors?.pausedIcon || 'fill-amber-500 text-amber-500'}`}
                  style={preset.icon}
                />
                <CircularProgress
                  percentage={progress}
                  size={preset.ring}
                  color={progressColors?.paused}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Lanjutkan</TooltipContent>
          </Tooltip>
          {showPercentage && <span className={percentageClass}>{progress}%</span>}
        </div>
      );
    }

    if (status === 'error') {
      return (
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onRetry}
              className="flex h-auto items-center gap-1 rounded-full border-0 bg-red-500/60 px-2.5 py-1 text-white text-xs backdrop-blur-sm hover:bg-red-500/80"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Gagal</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Coba unduh ulang</TooltipContent>
        </Tooltip>
      );
    }

    return null;
  },
);

DownloadStatusControls.displayName = 'DownloadStatusControls';

export default DownloadStatusControls;

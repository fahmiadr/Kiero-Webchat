import { Download, ExternalLink } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EXT_PDF } from '@/constants/fileTypes';
import { useAttachment } from '@/hooks/useAttachment';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore';
import { cn } from '@/utils/cn';
import { getFileIconProps } from '@/utils/fileIcons';
import { formatBytes } from '@/utils/formatUtils';
import { MEDIA_LAYOUT } from '@/utils/mediaLayoutUtils';
import DownloadStatusControls from './DownloadStatusControls';

/**
 * DocumentAttachment Component
 *
 * Refactored to use:
 * - useAttachmentMetadata (Deduplicated size/type fetch)
 * - useObjectUrl (Global blob registry)
 * - Robust Open/Save logic for both local and remote files
 */
const DocumentAttachment = memo(function DocumentAttachment({
  src,
  fileName,
  fileSize: propFileSize,
  className = '',
  onResize, // Injected prop for layout
  backendUrl, // Injected prop
  clientId,
  attachmentStyles,
}) {
  // Default styles fallback (Slate-like)
  const styles = useMemo(
    () =>
      attachmentStyles || {
        hover: 'hover:bg-slate-200',
        icon: 'text-slate-500',
        text: 'text-slate-700',
        meta: 'text-slate-500',
        ready: 'text-emerald-600',
      },
    [attachmentStyles],
  );
  // Build full URL for API
  const fullUrl = src?.startsWith('http') || src?.startsWith('blob:') ? src : `${backendUrl}${src}`;

  // Optimization: Avoid flash if cached in session
  const [isEnabled, setIsEnabled] = useState(() => {
    if (src?.startsWith('blob:')) return false; // Local uploads don't need "downloading"
    return false;
  });

  // Get file extension
  const ext = fileName?.split('.').pop()?.toUpperCase() || '';
  const isPdf = EXT_PDF.includes(ext.toLowerCase());

  // Get consistent icon
  const { Icon: FileIcon, iconClass } = getFileIconProps(fileName);

  // 1. Metadata (Size) -> Use Prop
  const fileSize = propFileSize;

  // 2. Data (Blob) - Deduplicated
  const {
    data: fileBlob,
    isLoading,
    isError,
    refetch,
    cancel,
  } = useAttachment(src, {
    enabled: isEnabled,
    backendUrl,
    clientId,
  });

  // 3. Blob URL - Registry Managed
  const blobUrl = useObjectUrl(fileBlob);

  const downloadProgress = useAttachmentProgressStore((s) => s.getProgress(src, 'download') || 0);

  // Check React Query Cache on mount (Restore state)
  // REMOVED IDB CHECK AS REQUESTED
  // Check React Query Cache on mount (Restore state)
  // REMOVED IDB CHECK AS REQUESTED
  useEffect(() => {
    if (!fullUrl || fullUrl.startsWith('blob:')) return;
    // Logic removed to match VideoThumbnail
  }, [fullUrl]);

  // Effective status
  const isOptimistic = src?.startsWith('blob:') || src?.startsWith('data:');

  let status = 'idle';
  if (isOptimistic)
    status = 'ready'; // Optimistic upload complete
  else if (isLoading && isEnabled) status = 'downloading';
  else if (isError) status = 'error';
  else if (fileBlob && !isLoading)
    status = 'ready'; // Ready (Downloaded)
  else if (!isEnabled && downloadProgress > 0 && !fileBlob) status = 'paused';

  const progress = downloadProgress;

  const reportedRef = useRef(false);

  // Callbacks
  const handleRef = useCallback(
    (node) => {
      if (node && onResize && !reportedRef.current) {
        onResize(MEDIA_LAYOUT.MAX_WIDTH);
        reportedRef.current = true;
      }
    },
    [onResize],
  );

  // Ready state for interaction
  // We consider it "interactive" if we have a blob OR if it's idle (we can trigger action)
  const isReady = Boolean(fileBlob);

  // Format file size
  const formattedSize = useMemo(() => formatBytes(fileSize), [fileSize]);

  // Handle download button click
  const handleDownload = useCallback(
    (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!fullUrl || status === 'downloading') return;
      setIsEnabled(true);
    },
    [fullUrl, status],
  );

  // Handle cancel/pause download
  const handleCancelDownload = useCallback(
    (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setIsEnabled(false);
      cancel();
    },
    [cancel],
  );

  // Handle open/save file
  const handleOpenFile = useCallback(
    (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      // If we have a blob interactable url (local or downloaded)
      const targetUrl = (src?.startsWith('blob:') ? src : blobUrl) || fullUrl;

      if (!targetUrl) return;

      if (isPdf) {
        // PDFs open in new tab
        window.open(targetUrl, '_blank');
      } else {
        // Others download
        const link = document.createElement('a');
        link.href = targetUrl;
        link.download = fileName || 'document';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    [src, blobUrl, fullUrl, isPdf, fileName],
  );

  // Handle click on main area
  const handleClick = useCallback(
    (e) => {
      e.preventDefault();

      // OPTIMISTIC: Allow opening file even during upload/error (using blob URL)
      // If it's a local blob, we can open it even while uploading
      if (src?.startsWith('blob:')) {
        handleOpenFile(e);
        return;
      }

      // If it's ready (downloaded) or it's a PDF (can open remote), open it
      if (status === 'ready') {
        handleOpenFile(e);
      } else if (status === 'idle' || status === 'error') {
        // If strictly idle, we usually download first
        handleDownload(e);
      }
    },
    [status, src, handleOpenFile, handleDownload],
  );

  return (
    <div
      ref={handleRef}
      style={{ width: '100%', maxWidth: `${MEDIA_LAYOUT.MAX_WIDTH}px` }}
      className={`rounded-xl ${className}`}
    >
      <Button
        variant="ghost"
        type="button"
        onClick={handleClick}
        className={cn(
          '!p-3 flex h-auto w-full items-center justify-start gap-3 text-left font-normal text-base transition-colors hover:bg-transparent',
          status === 'idle' || status === 'ready' || status === 'error' || src?.startsWith('blob:')
            ? cn('cursor-pointer rounded-xl', styles.hover)
            : 'cursor-default',
        )}
      >
        {/* Left: File icon — always visible */}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded">
          <FileIcon className={cn(iconClass, styles.icon)} />
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-medium text-xs', styles.text)}>
            {fileName || 'Document'}
          </p>
          <div className={cn('flex items-center gap-2 text-[10px]', styles.meta)}>
            <span className="uppercase">{ext || 'FILE'}</span>
            {fileSize && (
              <>
                <span>•</span>
                <span>{formattedSize}</span>
              </>
            )}
            {/* Show 'Siap' for ready state (downloaded or optimistic complete) */}
            {status === 'ready' && (
              <>
                <span>•</span>
                <span className={styles.ready}>Siap</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Action controls */}
        {status === 'idle' && !isReady && !isOptimistic && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-shrink-0">
                <Download className={cn('h-4 w-4', styles.meta)} />
              </div>
            </TooltipTrigger>
            <TooltipContent>Unduh dokumen</TooltipContent>
          </Tooltip>
        )}

        <DownloadStatusControls
          status={status}
          progress={progress}
          onCancel={handleCancelDownload}
          onResume={(e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            setIsEnabled(true);
          }}
          onRetry={(e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            setIsEnabled(true);
            refetch();
          }}
          size="md"
          variant="inline"
          progressColors={styles.progressColors}
          iconColor={styles.icon}
        />

        {/* Open/Save button - only when ready (not during upload) */}
        {status === 'ready' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-shrink-0">
                {isPdf ? (
                  <ExternalLink className={cn('h-4 w-4', styles.meta)} />
                ) : (
                  <Download className={cn('h-4 w-4', styles.meta)} />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>{isPdf ? 'Buka PDF' : 'Simpan file'}</TooltipContent>
          </Tooltip>
        )}
      </Button>
    </div>
  );
});

export default DocumentAttachment;

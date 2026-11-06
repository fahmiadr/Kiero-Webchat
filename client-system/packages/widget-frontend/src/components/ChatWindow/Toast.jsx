import { m } from 'framer-motion';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

const Toast = ({ message, type = 'error', onClose, duration = 3000 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    if (duration && !isExpanded) {
      // Pause timer if expanded
      const timer = setTimeout(() => {
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose, isExpanded]);

  useEffect(() => {
    const el = textRef.current;
    if (el && !isExpanded) {
      // Robust detection: if scrollHeight is strictly greater than client height,
      // it means the text is being clipped by line-clamp.
      setIsTruncated(el.scrollHeight > el.clientHeight);
    }
  }, [message, isExpanded]);

  const isError = type === 'error';

  return (
    <m.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`relative flex w-full items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-md ${
        isError
          ? 'border-red-200 bg-red-50/95 text-red-800'
          : 'border-green-200 bg-green-50/95 text-green-800'
      }`}
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isError ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}
      >
        {isError ? <AlertCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
      </div>

      <div
        className="min-w-0 flex-1 cursor-pointer"
        role="dialog"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <p
          ref={textRef}
          className={`break-words font-medium text-sm leading-tight ${isExpanded ? '' : 'line-clamp-2'}`}
        >
          {message}
        </p>
        {isTruncated && (
          <Button
            variant="link"
            size="sm"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="mt-1 block h-auto p-0 font-semibold text-inherit text-xs underline opacity-80 hover:no-underline hover:opacity-100"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </Button>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        type="button"
        onClick={onClose}
        className={`-mt-1 -mr-1 h-6 w-6 shrink-0 rounded-full transition-colors ${isError ? 'text-red-500 hover:bg-red-200/50' : 'text-green-500 hover:bg-green-200/50'}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </m.div>
  );
};

export default Toast;

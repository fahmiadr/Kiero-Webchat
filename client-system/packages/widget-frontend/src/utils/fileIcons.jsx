/* eslint-disable react-refresh/only-export-components */
import { File, Headphones } from 'lucide-react';
import {
  EXT_ARCHIVE,
  EXT_AUDIO,
  EXT_EXCEL,
  EXT_PDF,
  EXT_PPT,
  EXT_TXT,
  EXT_VIDEO,
  EXT_WORD,
  MIME_PREFIX_AUDIO,
  MIME_PREFIX_VIDEO,
} from '@/constants/fileTypes';

// Modern Premium Icons (Solid Flat Design with Fold)
// No stroke, just fill colors. Fold uses opacity for depth.

const SolidFileIcon = ({ className, color, label, labelSize = '8.5', children }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Main Body (Cut top-right corner) */}
    <path
      d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z"
      fill={color}
    />

    {/* Fold Flap (White transparent for highlight/fold effect) */}
    <path d="M14 2V8H20" fill="rgba(255,255,255,0.3)" />

    {/* Content: Label or Custom Children */}
    {children ? (
      children
    ) : (
      <text
        className="select-none"
        x="12"
        y="17"
        fontSize={labelSize}
        fontFamily="sans-serif"
        fontWeight="700"
        textAnchor="middle"
        fill="white"
      >
        {label}
      </text>
    )}
  </svg>
);

// Specific implementations
const WordIcon = ({ className }) => (
  <SolidFileIcon className={className} color="#2563EB" label="W" />
);
const ExcelIcon = ({ className }) => (
  <SolidFileIcon className={className} color="#10B981" label="X" />
);
const PDFIcon = ({ className }) => (
  <SolidFileIcon className={className} color="#EF4444" label="PDF" labelSize="6" />
);
const PPTIcon = ({ className }) => (
  <SolidFileIcon className={className} color="#F97316" label="P" />
);
const TxtIcon = ({ className }) => (
  <SolidFileIcon className={className} color="#64748B" label="TXT" labelSize="6" />
);
const ZipIcon = ({ className }) => (
  <SolidFileIcon className={className} color="#F59E0B">
    {/* Zipper Graphic */}
    <path
      d="M12 9V20"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeDasharray="0.5 2.5"
    />
    <path d="M12 9L12 7" stroke="white" strokeWidth="3" strokeLinecap="round" />
    <rect x="10.5" y="7" width="3" height="3" rx="0.5" fill="white" />
  </SolidFileIcon>
);
const MP4Icon = ({ className }) => (
  <SolidFileIcon className={className} color="#4B5563" label="MP4" labelSize="6" />
);

/**
 * Returns rendering properties for file icons based on extension/mime type.
 * @param {string} fileName
 * @param {string} mimeType
 * @returns {object} { Icon: ReactComponent, iconClass: string, containerClass: string, label?: string, labelClass?: string }
 */
export const getFileIconProps = (fileName, mimeType) => {
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  const safeMime = mimeType || '';

  // Audio - Gradient Background (Keep previous style as it matches premium look)
  if (safeMime.startsWith(MIME_PREFIX_AUDIO) || EXT_AUDIO.includes(ext)) {
    return {
      Icon: Headphones,
      iconClass: 'text-white w-8 h-8',
      containerClass: 'bg-gradient-to-br from-orange-400 via-orange-500 to-red-500',
      type: 'audio',
    };
  }

  // Video - MP4 specifically mentioned in ref as Icon
  // If we have video preview, we usually show image. But fallback needs icon.
  // Ref image shows MP4 icon.
  if (safeMime.startsWith(MIME_PREFIX_VIDEO) || EXT_VIDEO.includes(ext)) {
    return {
      Icon: MP4Icon,
      iconClass: 'text-slate-200 w-10 h-10', // Use specific color in component, class sizing only
      containerClass: 'bg-card', // Consistent theme bg
      type: 'video',
    };
  }

  // Documents - Background varies with theme
  if (EXT_WORD.includes(ext)) {
    return {
      Icon: WordIcon,
      iconClass: 'w-10 h-10', // Color handled inside SVG
      containerClass: 'bg-card',
      type: 'word',
    };
  }

  if (EXT_EXCEL.includes(ext)) {
    return {
      Icon: ExcelIcon,
      iconClass: 'w-10 h-10',
      containerClass: 'bg-card',
      type: 'excel',
    };
  }

  if (EXT_PDF.includes(ext)) {
    return {
      Icon: PDFIcon,
      iconClass: 'w-10 h-10',
      containerClass: 'bg-card',
      type: 'pdf',
    };
  }

  if (EXT_PPT.includes(ext)) {
    return {
      Icon: PPTIcon,
      iconClass: 'w-10 h-10',
      containerClass: 'bg-card',
      type: 'ppt',
    };
  }

  if (EXT_TXT.includes(ext)) {
    return {
      Icon: TxtIcon,
      iconClass: 'w-10 h-10',
      containerClass: 'bg-card',
      type: 'txt',
    };
  }

  // Archive
  if (EXT_ARCHIVE.includes(ext)) {
    return {
      Icon: ZipIcon,
      iconClass: 'w-10 h-10',
      containerClass: 'bg-card',
      type: 'archive',
    };
  }

  // Default
  return {
    Icon: File, // Generic file
    iconClass: 'text-slate-400 w-8 h-8',
    containerClass: 'bg-slate-100',
    type: 'file',
  };
};

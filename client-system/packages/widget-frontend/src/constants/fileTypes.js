export const EXT_WORD = ['doc', 'docx'];
export const EXT_EXCEL = ['xls', 'xlsx', 'csv'];
export const EXT_PPT = ['ppt', 'pptx'];
export const EXT_PDF = ['pdf'];
export const EXT_TXT = ['txt'];
export const EXT_ARCHIVE = ['zip', 'rar', '7z'];
export const EXT_AUDIO = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];
export const EXT_VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv'];

// Composite lists
export const DOCUMENT_EXTENSIONS = [
  ...EXT_WORD,
  ...EXT_EXCEL,
  ...EXT_PPT,
  ...EXT_PDF, // Although specific check usually preferred
  ...EXT_TXT,
  ...EXT_ARCHIVE,
];

const ALLOWED_EXTENSIONS = [...DOCUMENT_EXTENSIONS];

export const MIME_PREFIX_IMAGE = 'image/';
export const MIME_PREFIX_VIDEO = 'video/';
export const MIME_PREFIX_AUDIO = 'audio/';

export const ACCEPT_IMAGE = 'image/*';
export const ACCEPT_VIDEO = 'video/*';
export const ACCEPT_AUDIO = 'audio/*';

const ALLOWED_MIME_PREFIXES = [MIME_PREFIX_IMAGE, MIME_PREFIX_VIDEO, MIME_PREFIX_AUDIO];

export const ALLOWED_FILE_TYPES_STRING = [
  ...ALLOWED_EXTENSIONS.map((ext) => `.${ext}`),
  ACCEPT_IMAGE,
  ACCEPT_VIDEO,
  ACCEPT_AUDIO,
].join(',');

export const isFileAllowed = (file) => {
  const mimeType = file.type || '';
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // Check mime types
  if (ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return true;
  }

  // Check extensions
  return ALLOWED_EXTENSIONS.includes(ext);
};

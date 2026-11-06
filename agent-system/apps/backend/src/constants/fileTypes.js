/**
 * File Type Constants
 * 
 * Shared constants for file validation and handling.
 * Kept consistent with Frontend definitions.
 */

// 1. Broad Category Prefixes (Matches Frontend)
export const MIME_PREFIX_IMAGE = 'image/';
export const MIME_PREFIX_VIDEO = 'video/';
export const MIME_PREFIX_AUDIO = 'audio/';

// 2. Allowed Extensions (Matches Frontend)
export const ALLOWED_DOC_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'txt', 'csv', 'zip', 'rar'
];

// 3. Explicit MIME Whitelists (Backend Specific Strictness)
export const ALLOWED_MIME_TYPES = {
    image: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml'
    ],
    video: [
        'video/mp4',
        'video/webm',
        'video/ogg',
        'video/quicktime',
        'video/x-msvideo'
    ],
    audio: [
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/ogg',
        'audio/webm',
        'audio/aac',
        'audio/m4a'
    ],
    document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'application/zip',
        'application/x-zip-compressed',
        'application/x-rar-compressed'
    ]
};

// 4. Extension to MIME Map (Centralized for Download/Preview)
export const EXTENSION_TO_MIME = {
    // Images
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    // Videos
    mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
    mov: 'video/quicktime', avi: 'video/x-msvideo',
    // Audio
    mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac',
    m4a: 'audio/m4a', weba: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg',
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', csv: 'text/csv',
    zip: 'application/x-zip-compressed', rar: 'application/x-rar-compressed'
};

// 5. MIME to Extension Map (for saving files)
export const MIME_TO_EXTENSION = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogv',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/webm': '.weba',
    'audio/aac': '.aac',
    'audio/m4a': '.m4a',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/x-rar-compressed': '.rar'
};

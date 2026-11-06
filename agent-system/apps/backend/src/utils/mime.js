/**
 * Mime Type Utility
 * 
 * Simple helper to lookup mime types from file extensions.
 * Used for webhook payloads and other file handling needs.
 */

export const getMimeType = (filename) => {
    if (!filename) return 'application/octet-stream';

    const ext = filename.split('.').pop().toLowerCase();

    const mimeMap = {
        // Images
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'bmp': 'image/bmp',
        'ico': 'image/x-icon',
        'tiff': 'image/tiff',
        'tif': 'image/tiff',

        // Video
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogv': 'video/ogg',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',

        // Audio
        'mp3': 'audio/mpeg',
        'ogg': 'audio/ogg',
        'wav': 'audio/wav',
        'm4a': 'audio/mp4',

        // Documents
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'json': 'application/json',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed'
    };

    return mimeMap[ext] || null; // Return null if not found to allow fallback
};

/**
 * Upload Service
 * 
 * Handles file uploads with validation, storage, and cleanup.
 * Stores files locally in /uploads directory organized by type.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ALLOWED_MIME_TYPES, MIME_TO_EXTENSION } from '../constants/fileTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// CONFIGURATION
// ============================================================

const UPLOAD_CONFIG = {
    // Base upload directory (relative to project root)
    baseDir: path.resolve(__dirname, '../../../uploads'),

    // Max file sizes (in bytes)
    maxSizes: {
        image: 10 * 1024 * 1024,    // 10MB
        video: 50 * 1024 * 1024,    // 50MB
        audio: 25 * 1024 * 1024,    // 25MB
        document: 25 * 1024 * 1024  // 25MB
    },

    // Allowed MIME types per category
    allowedTypes: ALLOWED_MIME_TYPES,

    // File extension mapping
    extensions: MIME_TO_EXTENSION
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Ensure upload directories exist
 */
function ensureDirectories() {
    const dirs = ['image', 'video', 'audio', 'document'];
    dirs.forEach(dir => {
        const fullPath = path.join(UPLOAD_CONFIG.baseDir, dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    });
}

/**
 * Determine file category from MIME type
 * @param {string} mimeType 
 * @returns {string|null} Category: image, video, audio, document, or null
 */
function getFileCategory(mimeType) {
    for (const [category, types] of Object.entries(UPLOAD_CONFIG.allowedTypes)) {
        if (types.includes(mimeType)) {
            return category;
        }
    }
    return null;
}

/**
 * Generate unique filename
 * @param {string} originalName 
 * @param {string} mimeType 
 * @returns {string} Unique filename
 */
function generateFilename(originalName, mimeType) {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');

    // Use original file extension first, fall back to MIME-based extension
    const originalExt = path.extname(originalName);
    const extension = originalExt || UPLOAD_CONFIG.extensions[mimeType] || '.bin';

    // Get name without extension
    const nameWithoutExt = path.basename(originalName, originalExt);

    const sanitizedName = nameWithoutExt
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .substring(0, 50);

    return `${timestamp}_${randomId}_${sanitizedName}${extension}`;
}

/**
 * Format bytes to human readable
 * @param {number} bytes 
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================
// MAIN SERVICE CLASS
// ============================================================

class UploadService {
    constructor() {
        ensureDirectories();
    }

    /**
     * Validate file before upload
     * @param {Object} file - File object { filename, mimetype, data }
     * @param {string} expectedCategory - Expected category (optional)
     * @returns {Object} { valid: boolean, error?: string, category?: string }
     */
    validate(file, expectedCategory = null) {
        const { filename, mimetype, data } = file;
        const fileSize = Buffer.byteLength(data);

        // Determine category
        const category = getFileCategory(mimetype);

        if (!category) {
            return {
                valid: false,
                error: `File type not allowed: ${mimetype}`
            };
        }

        // Check if matches expected category
        if (expectedCategory && category !== expectedCategory) {
            return {
                valid: false,
                error: `Expected ${expectedCategory} file, got ${category}`
            };
        }

        // Check file size
        const maxSize = UPLOAD_CONFIG.maxSizes[category];
        if (fileSize > maxSize) {
            return {
                valid: false,
                error: `File too large. Max size for ${category}: ${formatBytes(maxSize)}`
            };
        }

        return { valid: true, category };
    }

    /**
     * Save file to disk
     * @param {Object} file - File object { filename, mimetype, data }
     * @param {string} category - File category
     * @returns {Object} { success: boolean, data?: Object, error?: string }
     */
    async save(file, category) {
        try {
            const { filename: originalName, mimetype, data } = file;
            const newFilename = generateFilename(originalName, mimetype);
            const relativePath = path.join(category, newFilename);
            const absolutePath = path.join(UPLOAD_CONFIG.baseDir, relativePath);

            // Write file
            await fs.promises.writeFile(absolutePath, data);

            return {
                success: true,
                data: {
                    fileName: originalName,
                    storedName: newFilename,
                    fileType: category,
                    mimeType: mimetype,
                    fileSize: Buffer.byteLength(data),
                    relativePath,
                    absolutePath,
                    // URL path for download API (without /api prefix since frontend adds it via config.apiUrl)
                    urlPath: `/upload/download/${relativePath.replace(/\\/g, '/')}`
                }
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to save file: ${error.message}`
            };
        }
    }

    /**
     * Upload file with validation
     * @param {Object} file - File object { filename, mimetype, data }
     * @param {string} expectedCategory - Expected category (optional)
     * @returns {Object} Upload result
     */
    async upload(file, expectedCategory = null) {
        // Validate
        const validation = this.validate(file, expectedCategory);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        // Save
        return await this.save(file, validation.category);
    }

    /**
     * Delete file from disk
     * @param {string} relativePath - Relative path from uploads dir
     * @returns {boolean} Success
     */
    async delete(relativePath) {
        try {
            const absolutePath = path.join(UPLOAD_CONFIG.baseDir, relativePath);
            if (fs.existsSync(absolutePath)) {
                await fs.promises.unlink(absolutePath);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Get file info
     * @param {string} relativePath 
     * @returns {Object|null}
     */
    getFileInfo(relativePath) {
        const absolutePath = path.join(UPLOAD_CONFIG.baseDir, relativePath);
        if (!fs.existsSync(absolutePath)) {
            return null;
        }

        const stats = fs.statSync(absolutePath);
        return {
            exists: true,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
        };
    }

    /**
     * Get upload config (for frontend)
     */
    getConfig() {
        return {
            maxSizes: UPLOAD_CONFIG.maxSizes,
            allowedTypes: UPLOAD_CONFIG.allowedTypes
        };
    }
}

// Export singleton instance
const uploadService = new UploadService();
export default uploadService;
export { UPLOAD_CONFIG };

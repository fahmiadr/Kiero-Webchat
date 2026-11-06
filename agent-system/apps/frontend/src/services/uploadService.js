import api from '@/lib/axios';

/**
 * Upload Service (Frontend)
 * Handles file uploads to the backend with cancellation support
 */
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Upload Service (Frontend)
 * Handles file uploads to the backend with cancellation support
 */
export const uploadService = {
    /**
     * Upload a single file with cancellation support
     * @param {File} file - File object from input
     * @param {string} type - Optional expected type (image, video, audio, document)
     * @param {Function} onProgress - Optional progress callback (percentage)
     * @param {AbortController} abortController - Optional abort controller for cancellation
     * @returns {Promise<Object>} - Upload response data
     */
    upload: async (file, type = null, onProgress = null, abortController = null) => {
        // Pre-upload validation: Check file size
        if (file.size > MAX_FILE_SIZE) {
            const error = new Error('File terlalu besar (Maksimal 50MB)');
            error.code = 'FILE_TOO_LARGE';
            throw error;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const url = type ? `/upload?type=${type}` : '/upload';
            const config = {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (progressEvent) => {
                    if (onProgress) {
                        const percentCompleted = Math.round(
                            (progressEvent.loaded * 100) / progressEvent.total
                        );
                        onProgress(percentCompleted);
                    }
                },
            };

            // Add abort signal if controller provided
            if (abortController) {
                config.signal = abortController.signal;
            }

            const response = await api.post(url, formData, config);

            return response.data; // { success: true, data: { ...fileInfo } }
        } catch (error) {
            if (error.name === 'CanceledError' || error.name === 'AbortError') {
                // Upload was cancelled - don't log as error
                throw error;
            }

            if (error.response) {
                // Handle 413 Payload Too Large
                if (error.response.status === 413) {
                    const sizeError = new Error('File terlalu besar (Maksimal 50MB)');
                    sizeError.code = 'FILE_TOO_LARGE';
                    throw sizeError;
                }

                // Handle 429 Rate Limit
                if (error.response.status === 429) {
                    const rateLimitError = new Error('Terlalu banyak permintaan upload. Silakan tunggu sebentar.');
                    rateLimitError.code = 'RATE_LIMIT_EXCEEDED';
                    // Extract retry-after if available
                    const retryAfter = error.response.headers['retry-after'] || error.response.data?.error?.retryAfter || 60;
                    rateLimitError.retryAfter = retryAfter;
                    throw rateLimitError;
                }
            }

            console.error('Upload failed:', error);
            throw error;
        }
    },

    /**
     * Delete an uploaded file
     * @param {string} relativePath - The relative path returned by upload (e.g. image/123.png)
     * @returns {Promise<Object>} - Confirmation
     */
    deleteFile: async (relativePath) => {
        try {
            const response = await api.delete('/upload', {
                data: { path: relativePath }
            });
            return response.data;
        } catch (error) {
            console.error('Delete failed:', error);
            throw error;
        }
    }
};

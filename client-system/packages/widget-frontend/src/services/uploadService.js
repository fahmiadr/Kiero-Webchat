const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Upload Service (Widget Frontend)
 * Handles file uploads to the backend with progress tracking and cancellation support
 */
export const uploadService = {
  /**
   * Upload a single file with cancellation support
   * @param {string} backendUrl - Widget backend URL
   * @param {string} clientId - Tenant client ID for authentication
   * @param {File} file - File object from input
   * @param {string} type - Optional expected type (image, video, audio, document)
   * @param {Function} onProgress - Optional progress callback (percentage)
   * @param {AbortController} abortController - Optional abort controller for cancellation
   * @returns {Promise<Object>} - Upload response data { success, data: { url, thumbnailUrl, ... } }
   */
  upload: async (backendUrl, clientId, file, type = null, onProgress = null, abortController = null) => {
    // Pre-upload validation: Check file size
    if (file.size > MAX_FILE_SIZE) {
      const error = new Error('File terlalu besar (Maksimal 50MB)');
      error.code = 'FILE_TOO_LARGE';
      throw error;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const url = type ? `${backendUrl}/api/upload?type=${type}` : `${backendUrl}/api/upload`;

      const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Setup abort handling
        if (abortController) {
          abortController.signal.addEventListener('abort', () => {
            xhr.abort();
            reject(new DOMException('Upload cancelled', 'AbortError'));
          });
        }

        // Progress tracking
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            const percentCompleted = Math.round((event.loaded * 100) / event.total);
            onProgress(percentCompleted);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error('Invalid JSON response'));
            }
          } else if (xhr.status === 413) {
            const error = new Error('File terlalu besar (Maksimal 50MB)');
            error.code = 'FILE_TOO_LARGE';
            reject(error);
          } else if (xhr.status === 429) {
            // Rate limited — extract retry-after from header or response body
            const retryAfterHeader = xhr.getResponseHeader('Retry-After');
            let retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;

            try {
              const body = JSON.parse(xhr.responseText);
              if (body?.error?.retryAfter) {
                retryAfter = body.error.retryAfter;
              }
            } catch {
              /* ignore parse errors */
            }

            const rateLimitError = new Error(
              'Terlalu banyak permintaan upload. Silakan tunggu sebentar.',
            );
            rateLimitError.code = 'RATE_LIMIT_EXCEEDED';
            rateLimitError.retryAfter = retryAfter;
            reject(rateLimitError);
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

        xhr.open('POST', url);
        xhr.setRequestHeader('X-Client-Id', clientId);
        xhr.send(formData);
      });

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Upload was cancelled - rethrow for caller to handle
        throw error;
      }
      throw error;
    }
  },
};

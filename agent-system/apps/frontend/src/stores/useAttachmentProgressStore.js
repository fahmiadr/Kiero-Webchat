import { create } from 'zustand';

/**
 * Attachment Progress Store
 * 
 * Lightweight store purely for tracking upload/download progress percentages.
 * Data caching is handled by TanStack Query.
 */
const useAttachmentProgressStore = create((set, get) => ({
    // format: { [url]: number (0-100) }
    uploadProgress: {},
    downloadProgress: {},

    setUploadProgress: (url, progress) => {
        set(state => ({
            uploadProgress: { ...state.uploadProgress, [url]: progress }
        }));
    },

    setDownloadProgress: (url, progress) => {
        set(state => ({
            downloadProgress: { ...state.downloadProgress, [url]: progress }
        }));
    },

    // Helper to get specific progress
    getProgress: (url, type = 'download') => {
        const state = get();
        return type === 'upload' ? state.uploadProgress[url] : state.downloadProgress[url];
    },

    // Clear progress when done
    clearProgress: (url) => {
        set(state => {
            const newUpload = { ...state.uploadProgress };
            const newDownload = { ...state.downloadProgress };
            delete newUpload[url];
            delete newDownload[url];
            return { uploadProgress: newUpload, downloadProgress: newDownload };
        });
    }
}));

export default useAttachmentProgressStore;

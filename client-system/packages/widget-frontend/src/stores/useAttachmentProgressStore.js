import { create } from 'zustand';

const useAttachmentProgressStore = create((set, get) => ({
  uploadProgress: {},
  downloadProgress: {},

  setUploadProgress: (url, progress) => {
    set((state) => ({
      uploadProgress: { ...state.uploadProgress, [url]: progress },
    }));
  },

  setDownloadProgress: (url, progress) => {
    set((state) => ({
      downloadProgress: { ...state.downloadProgress, [url]: progress },
    }));
  },

  getProgress: (url, type = 'download') => {
    const state = get();
    return type === 'upload' ? state.uploadProgress[url] : state.downloadProgress[url];
  },

  clearProgress: (url) => {
    set((state) => {
      const newUpload = { ...state.uploadProgress };
      const newDownload = { ...state.downloadProgress };
      const newChunks = { ...state.downloadChunks };
      delete newUpload[url];
      delete newDownload[url];
      delete newChunks[url];
      return {
        uploadProgress: newUpload,
        downloadProgress: newDownload,
        downloadChunks: newChunks,
      };
    });
  },

  // Chunk Storage for Resumable Downloads
  downloadChunks: {}, // { url: [Uint8Array, Uint8Array] }

  addChunk: (url, chunk) => {
    set((state) => {
      const currentChunks = state.downloadChunks[url] || [];
      return {
        downloadChunks: {
          ...state.downloadChunks,
          [url]: [...currentChunks, chunk],
        },
      };
    });
  },

  getCombinedChunks: (url) => {
    const state = get();
    return state.downloadChunks[url] || [];
  },

  getChunkSize: (url) => {
    const state = get();
    const chunks = state.downloadChunks[url] || [];
    return chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  },
}));

export default useAttachmentProgressStore;

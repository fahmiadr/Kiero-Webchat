import { AsyncQueuer } from '@tanstack/pacer';
import { useCallback, useState } from 'react';
import {
  isFileAllowed,
  MIME_PREFIX_AUDIO,
  MIME_PREFIX_IMAGE,
  MIME_PREFIX_VIDEO,
} from '@/constants/fileTypes';
import { acquireBlobUrl, releaseBlobUrl } from '@/hooks/useObjectUrl';
import { compressAudio, compressImage } from '@/services/mediaCompressionService';
import { uploadService } from '@/services/uploadService';
import { generateThumbnail, generateVideoThumbnail } from '@/utils/generateThumbnail';
import { generateUUID } from '@/utils/uuid';

// --- Concurrency Constants ---
const FILE_PROCESSING_CONCURRENCY = 5;
const UPLOAD_SEND_CONCURRENCY = 1; // Sequential: preserve message order

/**
 * Extract duration from audio/video file
 * @param {File} file - Audio/video file
 * @param {string} previewUrl - Blob URL of the file
 * @returns {Promise<number|null>} - Duration in seconds or null
 */
const getMediaDuration = (file, previewUrl) => {
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith(MIME_PREFIX_VIDEO);
    const element = isVideo ? document.createElement('video') : document.createElement('audio');

    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const duration = element.duration;
      // Clean up
      element.src = '';
      resolve(Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null);
    };
    element.onerror = () => {
      resolve(null);
    };
    element.src = previewUrl;
  });
};

export const useChatAttachments = ({
  backendUrl,
  clientId,
  sendMessage,
  addMessage,
  updateMessageStatus,
  updateMessageAttachment,
  removeMessage,
  showError,
  inputAreaRef,
}) => {
  const [previewAttachments, setPreviewAttachments] = useState([]);

  // Consolidate file handling logic (Array support + Streaming)
  const handleAddFiles = useCallback(
    async (files, explicitCaption = null) => {
      if (!files || files.length === 0) return;

      const validFiles = [];
      const invalidFiles = [];

      files.forEach((file) => {
        if (isFileAllowed(file)) {
          validFiles.push(file);
        } else {
          invalidFiles.push(file);
        }
      });

      if (invalidFiles.length > 0) {
        const invalidNames = invalidFiles.map((f) => f.name).join(', ');
        const invalidExtensions = [
          ...new Set(
            invalidFiles
              .map((f) => {
                const parts = f.name.split('.');
                return parts.length > 1 ? `.${parts.pop()}` : '';
              })
              .filter(Boolean),
          ),
        ].join(', ');

        showError(
          `File ${invalidExtensions} tidak didukung: ${invalidNames}`,
          'file-not-supported',
          5000,
        );
      }

      if (validFiles.length === 0) return;

      // Get current message from input ref if not provided explicitly
      const currentMessage = explicitCaption ?? inputAreaRef.current?.getMessage() ?? '';

      // Forward Sync: Check if first file supports caption and Input has text
      let initialCaption = '';
      let shouldClearInput = false;

      const firstFile = validFiles[0];
      let firstFileType = 'document';
      if (firstFile.type.startsWith(MIME_PREFIX_IMAGE)) firstFileType = 'image';
      else if (firstFile.type.startsWith(MIME_PREFIX_VIDEO)) firstFileType = 'video';
      else if (firstFile.type.startsWith(MIME_PREFIX_AUDIO)) firstFileType = 'audio';

      // Only transfer caption if NOT audio
      if (currentMessage.trim() && firstFileType !== 'audio') {
        initialCaption = currentMessage;
        shouldClearInput = true;
      }

      // 1. Create Placeholders Immediately
      const placeholders = validFiles.map((file, index) => {
        let type = 'document';
        const mimeType = file.type || '';
        if (mimeType.startsWith(MIME_PREFIX_IMAGE)) type = 'image';
        else if (mimeType.startsWith(MIME_PREFIX_VIDEO)) type = 'video';
        else if (mimeType.startsWith(MIME_PREFIX_AUDIO)) type = 'audio';

        const fileCaption = index === 0 && type !== 'audio' ? initialCaption : '';
        const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`;

        return {
          id,
          file,
          type,
          previewUrl: null, // Will be generated
          thumbnailUrl: null,
          thumbnailData: null,
          duration: null,
          caption: fileCaption,
          isLoading: true, // Mark as loading
        };
      });

      // 2. Render Immediately (Optimistic UI)
      setPreviewAttachments((prev) => [...prev, ...placeholders]);

      if (shouldClearInput) {
        inputAreaRef.current?.clear();
      }

      // 3. Process Files Concurrently (AsyncQueuer, max 5)
      const processingQueue = new AsyncQueuer(
        async (placeholder) => {
          const { file, type } = placeholder;

          // Use registry for proper blob URL management (ref counting)
          const previewUrl = acquireBlobUrl(file);
          let thumbnailUrl = null;
          let thumbnailData = null;

          if (type === 'image') {
            const res = await generateThumbnail(previewUrl);
            if (res) {
              thumbnailUrl = acquireBlobUrl(res.blob);
              thumbnailData = res;
            }
          } else if (type === 'video') {
            try {
              const res = await generateVideoThumbnail(previewUrl);
              if (res) {
                thumbnailUrl = acquireBlobUrl(res.blob);
                thumbnailData = res;
              }
            } catch {
              // Fallback or ignore
            }
          }

          // Extract duration for audio/video
          let duration = null;
          if (type === 'audio' || type === 'video') {
            duration = await getMediaDuration(file, previewUrl);
          }

          // Update specific attachment with result
          setPreviewAttachments((prev) =>
            prev.map((att) => {
              if (att.id === placeholder.id) {
                return {
                  ...att,
                  previewUrl,
                  thumbnailUrl,
                  thumbnailData,
                  duration,
                  isLoading: false,
                };
              }
              return att;
            }),
          );
        },
        {
          concurrency: FILE_PROCESSING_CONCURRENCY,
          started: true,
        },
      );

      // Queue all placeholders for concurrent processing
      placeholders.forEach((placeholder) => {
        processingQueue.addItem(placeholder);
      });
    },
    [showError, inputAreaRef],
  );

  // Wrapper for InputArea (handles single or multiple files)
  const handleAttachment = useCallback(
    (files, caption) => {
      const fileList = Array.isArray(files) ? files : [files];
      handleAddFiles(fileList, caption);
    },
    [handleAddFiles],
  );

  /**
   * retryUpload - Retry a failed upload
   * @param {string} messageId - The message ID to update
   * @param {Object} att - Original attachment data
   */
  const retryUpload = useCallback(
    async (messageId, att) => {
      const abortController = new AbortController();

      // Reset status to uploading
      updateMessageStatus(messageId, 'uploading');
      updateMessageAttachment(messageId, 0, {
        uploadStatus: 'uploading',
        uploadProgress: 0,
        onRetryUpload: null,
        onCancelUpload: () => {
          abortController.abort();
          removeMessage(messageId);
        },
      });

      try {
        const result = await uploadService.upload(
          backendUrl,
          clientId,
          att.file,
          att.type,
          (progress) => {
            updateMessageAttachment(messageId, 0, {
              uploadProgress: progress,
            });
          },
          abortController,
        );

        if (!result.success || !result.data) {
          // Retry failed - allow retry again
          updateMessageAttachment(messageId, 0, {
            uploadStatus: 'error',
            uploadProgress: 0,
            onRetryUpload: () => retryUpload(messageId, att),
          });
          updateMessageStatus(messageId, 'error');
          return;
        }

        const uploadedFile = result.data;

        // Release blob URLs cleanup
        if (att.previewUrl && att.file) releaseBlobUrl(att.file);
        if (att.thumbnailData?.blob) releaseBlobUrl(att.thumbnailData.blob);

        // Update attachment with final URLs
        updateMessageAttachment(messageId, 0, {
          url: uploadedFile.url,
          fileUrl: uploadedFile.url,
          thumbnailUrl: uploadedFile.thumbnailUrl || att.thumbnailUrl,
          uploadStatus: 'complete',
          uploadProgress: 100,
          meta: uploadedFile.meta || {},
        });

        // Update message status and send via socket
        updateMessageStatus(messageId, 'pending');

        sendMessage(
          att.caption || '',
          att.type,
          [
            {
              url: uploadedFile.url,
              fileUrl: uploadedFile.url,
              thumbnailUrl: uploadedFile.thumbnailUrl || att.thumbnailUrl,
              fileName: uploadedFile.fileName || att.file.name,
              name: uploadedFile.fileName || att.file.name,
              fileType: att.type,
              type: att.type,
              mimeType: att.file.type,
              size: att.file.size,
              meta: uploadedFile.meta || {},
            },
          ],
          {}, // metadata
          messageId, // existingMessageId
        );
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        updateMessageAttachment(messageId, 0, {
          uploadStatus: 'error',
          uploadProgress: 0,
          onRetryUpload: () => retryUpload(messageId, att),
        });
        updateMessageStatus(messageId, 'error');
      }
    },
    [backendUrl, sendMessage, updateMessageStatus, updateMessageAttachment, removeMessage],
  );

  /**
   * handlePreviewSend - Optimistic Upload: Show message immediately, upload in background
   * @param {Array} atts - Array of attachment objects from AttachmentPreviewDialog
   */
  const handlePreviewSend = useCallback(
    async (atts) => {
      // Close dialog immediately
      setPreviewAttachments([]);

      // Prepare all messages optimistically first (preserves visual order)
      const sendTasks = atts.map((att) => {
        const messageId = generateUUID();
        const abortController = new AbortController();

        // Build optimistic attachment (with blob URL for immediate preview)
        const optimisticMeta = {
          ...(att.thumbnailData
            ? { width: att.thumbnailData.width, height: att.thumbnailData.height }
            : {}),
          ...(att.duration ? { duration: att.duration } : {}),
        };

        const optimisticAttachment = {
          url: att.previewUrl,
          fileUrl: att.previewUrl,
          thumbnailUrl: att.thumbnailUrl,
          fileName: att.file.name,
          name: att.file.name,
          fileType: att.type,
          type: att.type,
          mimeType: att.file.type,
          size: att.file.size,
          uploadStatus: 'uploading',
          uploadProgress: 0,
          thumbnailBlob: att.thumbnailData?.blob,
          meta: optimisticMeta,
          onCancelUpload: () => {
            abortController.abort();
          },
        };

        const isCompressible = att.type === 'image' || att.type === 'audio';

        // Add message to store immediately (optimistic UI)
        addMessage({
          id: messageId,
          content: att.caption || '',
          type: att.type,
          status: isCompressible ? 'compressing' : 'uploading',
          timestamp: new Date().toISOString(),
          sender: 'visitor',
          attachments: [
            {
              ...optimisticAttachment,
              uploadStatus: isCompressible ? 'compressing' : 'uploading',
            },
          ],
        });

        return { att, messageId, abortController, optimisticMeta, isCompressible };
      });

      // Sequential upload queue (concurrency: 1 = FIFO order preserved)
      const uploadQueue = new AsyncQueuer(
        async (task) => {
          const { att, messageId, abortController, optimisticMeta, isCompressible } = task;

          try {
            // Step 1: Compress if applicable (image/audio only)
            let fileToUpload = att.file;

            if (att.type === 'image') {
              try {
                const compressionResult = await compressImage(att.file, {
                  previewUrl: att.previewUrl,
                  signal: abortController.signal,
                });
                if (!compressionResult.skipped) {
                  fileToUpload = compressionResult.file;
                }
              } catch {
                /* ignore, fall back to original */
              }
            } else if (att.type === 'audio') {
              try {
                let lastProgressUpdate = 0;
                const compressionResult = await compressAudio(
                  att.file,
                  (progress) => {
                    const now = Date.now();
                    if (now - lastProgressUpdate > 100 || progress === 100) {
                      lastProgressUpdate = now;
                      updateMessageAttachment(messageId, 0, {
                        uploadProgress: Math.round(progress * 0.5),
                      });
                    }
                  },
                  { signal: abortController.signal },
                );
                if (!compressionResult.skipped) {
                  fileToUpload = compressionResult.file;
                }
              } catch {
                /* ignore, fall back to original */
              }
            }

            // Check if aborted during compression
            if (abortController.signal.aborted) {
              throw new DOMException('Upload cancelled', 'AbortError');
            }

            // Step 2: Switch to uploading status
            updateMessageStatus(messageId, 'uploading');
            updateMessageAttachment(messageId, 0, {
              uploadStatus: 'uploading',
              uploadProgress: isCompressible ? 50 : 0,
            });

            // Step 3: Upload the file (compressed or original)
            const result = await uploadService.upload(
              backendUrl,
              clientId,
              fileToUpload,
              att.type,
              (progress) => {
                const adjustedProgress = isCompressible
                  ? Math.round(50 + progress * 0.5)
                  : progress;
                updateMessageAttachment(messageId, 0, {
                  uploadProgress: adjustedProgress,
                });
              },
              abortController,
            );

            if (!result.success || !result.data) {
              updateMessageAttachment(messageId, 0, {
                uploadStatus: 'error',
                uploadProgress: 0,
                onRetryUpload: () => retryUpload(messageId, att),
              });
              updateMessageStatus(messageId, 'error');
              return;
            }

            const uploadedFile = result.data;
            const serverUrl = uploadedFile.urlPath || uploadedFile.url;

            updateMessageAttachment(messageId, 0, {
              uploadStatus: 'complete',
              uploadProgress: 100,
            });
            updateMessageStatus(messageId, 'sent');

            // Send via socket (sequential ensures FIFO order)
            const finalMeta = {
              ...optimisticMeta,
              ...(uploadedFile.meta || {}),
            };

            sendMessage(
              att.caption || '',
              att.type,
              [
                {
                  url: serverUrl,
                  fileUrl: serverUrl,
                  thumbnailUrl: uploadedFile.thumbnailUrl || att.thumbnailUrl,
                  fileName: uploadedFile.fileName || att.file.name,
                  name: uploadedFile.fileName || att.file.name,
                  fileType: att.type,
                  type: att.type,
                  mimeType: att.file.type,
                  fileSize: uploadedFile.fileSize || att.file.size,
                  size: att.file.size,
                  meta: finalMeta,
                },
              ],
              {},
              messageId,
            );
          } catch (error) {
            if (
              error.name === 'AbortError' ||
              error.message?.includes('Aborted') ||
              error.message?.includes('cancelled')
            ) {
              removeMessage(messageId);
              return;
            }

            // Show rate-limit specific toast for HTTP 429
            if (error.code === 'RATE_LIMIT_EXCEEDED') {
              showError(`${error.message} (${error.retryAfter} detik)`, 'rate-limit-upload', 5000);
            } else if (error.code === 'FILE_TOO_LARGE') {
              showError(
                error.message, // "File terlalu besar (Maksimal 50MB)"
                'file-too-large',
                5000,
              );
            }

            updateMessageAttachment(messageId, 0, {
              uploadStatus: 'error',
              uploadProgress: 0,
              onRetryUpload: () => retryUpload(messageId, att),
            });
            updateMessageStatus(messageId, 'error');
          }
        },
        {
          concurrency: UPLOAD_SEND_CONCURRENCY,
          started: true,
        },
      );

      // Queue all send tasks (processed sequentially in FIFO order)
      sendTasks.forEach((task) => {
        uploadQueue.addItem(task);
      });
    },
    [
      backendUrl,
      sendMessage,
      addMessage,
      updateMessageStatus,
      updateMessageAttachment,
      removeMessage,
      retryUpload,
      showError,
    ],
  );

  return {
    previewAttachments,
    setPreviewAttachments,
    handleAttachment,
    handleAddFiles,
    handlePreviewSend,
    retryUpload,
  };
};

/**
 * Upload Routes
 * 
 * API endpoints for file uploads.
 * Supports multipart form data with file attachments.
 */
import uploadService from '../services/uploadService.js';
import {
    EXTENSION_TO_MIME,
    MIME_PREFIX_IMAGE,
    MIME_PREFIX_VIDEO,
    MIME_PREFIX_AUDIO,
    ALLOWED_MIME_TYPES
} from '../constants/fileTypes.js';

export default async function uploadRoutes(fastify) {
    // Register multipart support
    await fastify.register(import('@fastify/multipart'), {
        limits: {
            fileSize: 50 * 1024 * 1024, // 50MB max (highest limit)
            files: 5 // Max 5 files per request
        }
    });

    // ============================================================
    // GET /api/upload/config
    // Get upload configuration (allowed types, max sizes)
    // ============================================================
    fastify.get('/config', {
        schema: {
            description: 'Get upload configuration',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        return {
            success: true,
            data: uploadService.getConfig()
        };
    });

    // ============================================================
    // POST /api/upload
    // Upload single file
    // ============================================================
    fastify.post('/', {
        schema: {
            description: 'Upload a single file',
            consumes: ['multipart/form-data'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            additionalProperties: true
                        }
                    }
                },
                400: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const data = await request.file();

            if (!data) {
                return reply.status(400).send({
                    success: false,
                    error: 'No file provided'
                });
            }

            // Get file buffer
            const buffer = await data.toBuffer();

            // Get expected category from query (optional)
            const expectedCategory = request.query.type || null;

            // Upload file
            const result = await uploadService.upload({
                filename: data.filename,
                mimetype: data.mimetype,
                data: buffer
            }, expectedCategory);

            if (!result.success) {
                return reply.status(400).send({
                    success: false,
                    error: result.error
                });
            }

            // DEBUG LOG
            request.log.info({ uploadResult: result.data }, 'Sending upload response');

            return {
                success: true,
                data: result.data
            };
        } catch (error) {
            request.log.error({ err: error }, 'Upload error');
            return reply.status(500).send({
                success: false,
                error: 'Upload failed'
            });
        }
    });

    // ============================================================
    // POST /api/upload/multiple
    // Upload multiple files
    // ============================================================
    fastify.post('/multiple', {
        schema: {
            description: 'Upload multiple files',
            consumes: ['multipart/form-data']
        }
    }, async (request, reply) => {
        try {
            const parts = request.files();
            const results = [];
            const errors = [];

            for await (const part of parts) {
                const buffer = await part.toBuffer();

                const result = await uploadService.upload({
                    filename: part.filename,
                    mimetype: part.mimetype,
                    data: buffer
                });

                if (result.success) {
                    results.push(result.data);
                } else {
                    errors.push({
                        filename: part.filename,
                        error: result.error
                    });
                }
            }

            return {
                success: errors.length === 0,
                data: {
                    uploaded: results,
                    failed: errors
                }
            };
        } catch (error) {
            request.log.error({ err: error }, 'Multiple upload error');
            return reply.status(500).send({
                success: false,
                error: 'Upload failed'
            });
        }
    });

    // ============================================================
    // DELETE /api/upload
    // Delete a file
    // ============================================================
    fastify.delete('/', {
        schema: {
            description: 'Delete an uploaded file',
            body: {
                type: 'object',
                required: ['path'],
                properties: {
                    path: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { path: filePath } = request.body;

            // Security: prevent directory traversal
            if (filePath.includes('..')) {
                return reply.status(400).send({
                    success: false,
                    error: 'Invalid path'
                });
            }

            const deleted = await uploadService.delete(filePath);

            return {
                success: deleted,
                message: deleted ? 'File deleted' : 'File not found'
            };
        } catch (error) {
            request.log.error({ err: error }, 'Delete error');
            return reply.status(500).send({
                success: false,
                error: 'Delete failed'
            });
        }
    });

    // ============================================================
    // HEAD /api/upload/download/:category/:filename
    // Get file metadata (size, type) efficiently without download
    // ============================================================
    fastify.head('/download/:category/:filename', {
        schema: {
            description: 'Get file metadata efficiently',
            params: {
                type: 'object',
                properties: {
                    category: { type: 'string' },
                    filename: { type: 'string' }
                },
                required: ['category', 'filename']
            }
        }
    }, async (request, reply) => {
        try {
            const { category, filename } = request.params;

            // Security: prevent directory traversal
            if (filename.includes('..') || category.includes('..')) {
                return reply.status(400).send();
            }

            const relativePath = `${category}/${filename}`;
            // Use service to resolve path safely, but we need fs for stat
            // Since uploadService encapsulates path, we reuse getFileInfo logic or import here
            // Reusing getFileInfo is safer if it returns full path, but it currently returns object

            const fs = await import('fs');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const filePath = path.resolve(__dirname, '../../../uploads', relativePath);

            if (!fs.existsSync(filePath)) {
                return reply.status(404).send();
            }

            const stat = fs.statSync(filePath);

            // Determine MIME type
            const ext = filename.split('.').pop().toLowerCase();
            const mimeType = EXTENSION_TO_MIME[ext] || 'application/octet-stream';

            reply.header('Content-Type', mimeType);
            reply.header('Content-Length', stat.size);
            reply.header('Accept-Ranges', 'bytes');
            // Add custom header for existence check if needed
            return reply.send();

        } catch (error) {
            request.log.error({ err: error }, 'HEAD request error');
            return reply.status(500).send();
        }
    });

    // ============================================================
    // GET /api/upload/download/:category/:filename
    // Download or preview file (public access)
    // ============================================================
    fastify.get('/download/:category/:filename', {
        schema: {
            description: 'Download or preview a file',
            params: {
                type: 'object',
                properties: {
                    category: { type: 'string' },
                    filename: { type: 'string' }
                },
                required: ['category', 'filename']
            },
            querystring: {
                type: 'object',
                properties: {
                    name: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { category, filename } = request.params;

            // Security: prevent directory traversal
            if (filename.includes('..') || category.includes('..')) {
                return reply.status(400).send({
                    success: false,
                    error: 'Invalid path'
                });
            }

            const relativePath = `${category}/${filename}`;
            const fileInfo = uploadService.getFileInfo(relativePath);

            if (!fileInfo || !fileInfo.exists) {
                return reply.status(404).send({
                    success: false,
                    error: 'File not found'
                });
            }

            // Determine MIME type and disposition
            const ext = filename.split('.').pop().toLowerCase();
            const mimeType = EXTENSION_TO_MIME[ext] || 'application/octet-stream';

            // Types that can be previewed inline
            const inlineTypes = [MIME_PREFIX_IMAGE, MIME_PREFIX_VIDEO, MIME_PREFIX_AUDIO, 'application/pdf'];
            const isInline = inlineTypes.some(type => mimeType.startsWith(type));

            // Get original filename from query param if provided, else use stored filename
            const originalFilename = request.query.name || filename;

            // Build file path
            const fs = await import('fs');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const filePath = path.resolve(__dirname, '../../../uploads', relativePath);

            // Get file stats for Content-Length and Range support
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;

            // ============================================================
            // Range Request Support (for video seeking & partial content)
            // ============================================================
            const rangeHeader = request.headers.range;

            if (rangeHeader) {
                // Parse range header: "bytes=start-end"
                const parts = rangeHeader.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);

                // Keep end within bounds
                let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                if (end >= fileSize) {
                    end = fileSize - 1;
                }

                const chunkSize = (end - start) + 1;

                // Validate range: only fail if START is beyond file size.
                // It is normal for browsers to request end > fileSize.
                if (isNaN(start) || start >= fileSize || start > end) {
                    reply.status(416);
                    reply.header('Content-Range', `bytes */${fileSize}`);
                    return reply.send('Requested Range Not Satisfiable');
                }

                // Set headers for partial content
                reply.status(206);
                reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
                reply.header('Accept-Ranges', 'bytes');
                reply.header('Content-Length', chunkSize);
                reply.header('Content-Type', mimeType);
                reply.header('Content-Disposition',
                    isInline
                        ? `inline; filename="${originalFilename}"`
                        : `attachment; filename="${originalFilename}"`
                );

                // Stream partial content
                const stream = fs.createReadStream(filePath, { start, end });
                return reply.send(stream);
            }

            // ============================================================
            // Full File Response (no Range header)
            // ============================================================
            reply.header('Content-Type', mimeType);
            reply.header('Content-Length', fileSize);
            reply.header('Accept-Ranges', 'bytes');
            reply.header('Content-Disposition',
                isInline
                    ? `inline; filename="${originalFilename}"`
                    : `attachment; filename="${originalFilename}"`
            );

            // Stream the full file
            const stream = fs.createReadStream(filePath);
            return reply.send(stream);

        } catch (error) {
            request.log.error({ err: error }, 'Download error');
            return reply.status(500).send({
                success: false,
                error: 'Download failed'
            });
        }
    });
}

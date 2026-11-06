import { config } from '../config/index.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Upload Route (Widget -> Agent Backend Proxy)
 * Proxies file uploads from widget frontend to agent backend with authentication
 * Uses the same pattern as agent-backend (toBuffer approach)
 */
export default async function uploadRoutes(fastify) {
    // Register multipart support for file uploads
    await fastify.register(import('@fastify/multipart'), {
        limits: {
            fileSize: 50 * 1024 * 1024, // 50MB max
            files: 1 // Single file upload
        }
    });

    fastify.post('/', {
        schema: {
            description: 'Upload a single file (proxied to agent-backend)',
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
        const agentUrl = config.agentRequest.agentBackendUrl;
        const upstreamPath = '/api/upload';
        const upstreamUrl = `${agentUrl}${upstreamPath}`;

        try {
            const data = await request.file();

            if (!data) {
                return reply.status(400).send({
                    success: false,
                    error: 'No file provided'
                });
            }

            // Get file buffer (same pattern as agent-backend)
            const buffer = await data.toBuffer();

            fastify.log.info(`[UploadProxy] Uploading file: ${data.filename} (${buffer.length} bytes)`);

            // Generate Signature for authentication
            const timestamp = Date.now().toString();
            const stringToSign = `POST:${upstreamPath}:${timestamp}`;
            const signature = crypto
                .createHmac('sha256', config.webhook.secret)
                .update(stringToSign)
                .digest('hex');

            // Optional: pass type hint from query
            const typeHint = request.query.type;
            const targetUrl = typeHint ? `${upstreamUrl}?type=${typeHint}` : upstreamUrl;

            // Send multipart request to agent-backend using axios
            // We reconstruct the multipart form using a Blob/Buffer approach
            const boundary = `----FormBoundary${crypto.randomUUID().replace(/-/g, '')}`;

            // Build multipart body manually
            const CRLF = '\r\n';
            const contentDisposition = `Content-Disposition: form-data; name="file"; filename="${data.filename}"`;
            const contentType = `Content-Type: ${data.mimetype}`;

            const header = [
                `--${boundary}`,
                contentDisposition,
                contentType,
                '',
                ''
            ].join(CRLF);

            const footer = CRLF + `--${boundary}--` + CRLF;

            // Combine header, buffer, and footer
            const headerBuffer = Buffer.from(header, 'utf8');
            const footerBuffer = Buffer.from(footer, 'utf8');
            const body = Buffer.concat([headerBuffer, buffer, footerBuffer]);

            const response = await axios({
                method: 'post',
                url: targetUrl,
                data: body,
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
                    'X-Widget-Signature': signature,
                    'X-Widget-Timestamp': timestamp
                },
                maxContentLength: 50 * 1024 * 1024,
                maxBodyLength: 50 * 1024 * 1024
            });

            fastify.log.info(`[UploadProxy] Upload successful: ${response.data?.data?.urlPath || 'unknown'}`);

            // Transform response: prefix urlPath with agent-backend PUBLIC URL
            // So database stores full URL accessible by frontends
            // Uses AGENT_BACKEND_PUBLIC_URL (falls back to AGENT_BACKEND_URL)
            const responseData = response.data;
            if (responseData?.data?.urlPath) {
                const publicUrl = config.agentRequest.agentBackendPublicUrl;
                responseData.data.urlPath = `${publicUrl}/api${responseData.data.urlPath}`;
            }

            return reply.send(responseData);

        } catch (error) {
            fastify.log.error(`[UploadProxy] Upload failed: ${error.message}`);

            if (error.response) {
                return reply.status(error.response.status).send({
                    success: false,
                    error: error.response.data?.error || 'Upstream upload error'
                });
            }

            return reply.status(500).send({
                success: false,
                error: 'Upload proxy error'
            });
        }
    });
}

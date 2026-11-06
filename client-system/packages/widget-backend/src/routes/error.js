import { config } from '../config/index.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Error Reporting Route (Widget Backend → Agent Backend Proxy)
 * 
 * Proxies frontend error reports to the Agent Backend's centralized
 * audit log system. Uses the same authentication pattern as history.js
 * and upload.js (HMAC signature).
 * 
 * This backend does NOT store error logs locally.
 */
async function errorRoutes(fastify) {

    fastify.post('/report-error', {
        schema: {
            body: {
                type: 'object',
                required: ['error'],
                properties: {
                    clientId: { type: 'string' },
                    error: {
                        type: 'object',
                        required: ['message'],
                        properties: {
                            message: { type: 'string' },
                            name: { type: 'string' },
                            stack: { type: 'string' },
                            componentStack: { type: 'string' }
                        }
                    },
                    url: { type: 'string' },
                    timestamp: { type: 'string' },
                    referenceId: { type: 'string' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const agentUrl = config.agentRequest.agentBackendUrl;
        const upstreamPath = '/api/report-error';
        const upstreamUrl = `${agentUrl}${upstreamPath}`;

        try {
            // Enrich with server-side metadata
            const enrichedPayload = {
                ...request.body,
                ip: request.ip,
                userAgent: request.headers['user-agent'],
                source: 'widget'
            };

            // Generate HMAC Signature (same pattern as history.js / upload.js)
            const timestamp = Date.now().toString();
            const stringToSign = `POST:${upstreamPath}:${timestamp}`;
            const signature = crypto
                .createHmac('sha256', config.webhook.secret)
                .update(stringToSign)
                .digest('hex');

            request.log.info(
                { clientId: request.body.clientId },
                '[ErrorReport] Proxying error report to Agent Backend'
            );

            const response = await axios({
                method: 'post',
                url: upstreamUrl,
                data: enrichedPayload,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Widget-Signature': signature,
                    'X-Widget-Timestamp': timestamp
                },
                timeout: config.agentRequest.timeout,
                validateStatus: null // Capture all status codes
            });

            if (response.status !== 200) {
                request.log.error(
                    { status: response.status, data: response.data },
                    '[ErrorReport] Upstream report failed'
                );
                return reply.code(502).send({
                    success: false,
                    message: 'Failed to report error to backend'
                });
            }

            return { success: true, message: 'Error reported' };

        } catch (error) {
            request.log.error(
                { err: error, clientId: request.body?.clientId },
                '[ErrorReport] Failed to proxy error report'
            );

            if (error.response) {
                return reply.status(error.response.status).send({
                    success: false,
                    message: error.response.data?.message || 'Upstream error'
                });
            }

            return reply.code(502).send({
                success: false,
                message: 'Error reporting service unavailable'
            });
        }
    });
}

export default errorRoutes;

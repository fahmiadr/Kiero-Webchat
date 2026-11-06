import { config } from '../config/index.js';
import axios from 'axios';
import { rewriteAttachmentUrls } from '../utils/urlUtils.js';

export default async function historyRoutes(fastify) {
    const { redis } = fastify;

    fastify.get('/history', async (request, reply) => {
        const { sessionId } = request.query;

        if (!sessionId) {
            return reply.code(400).send({ error: 'Session ID is required' });
        }

        try {
            // Validate session
            const sessionData = await redis.get(`session:${sessionId}`);
            if (!sessionData) {
                return reply.code(404).send({ error: 'Session not found' });
            }

            const session = JSON.parse(sessionData);
            const { interactionId } = session;

            if (!interactionId) {
                return { messages: [] }; // No interaction yet
            }

            // Fetch history from Agent Backend via HTTP (Proxy)
            const agentUrl = config.agentRequest.agentBackendUrl;
            const upstreamPath = `/api/chat/${interactionId}/messages`;
            const upstreamUrl = `${agentUrl}${upstreamPath}`;

            request.log.info({ interactionId }, '[History] Fetching via proxy from Agent Backend');

            // Generate Signature
            const crypto = await import('crypto');
            const timestamp = Date.now().toString();
            // Sign: METHOD:PATH:TIMESTAMP (Path only, no query)
            // Note: Middleware on agent-backend checks URL path, ensure it matches.
            // On agent-backend/src/middlewares/auth.js: const urlPath = new URL(request.url, 'http://localhost').pathname;
            // So we sign specific path.
            const stringToSign = `GET:${upstreamPath}:${timestamp}`;
            const signature = crypto
                .createHmac('sha256', config.webhook.secret)
                .update(stringToSign)
                .digest('hex');

            const response = await axios({
                method: 'get',
                url: upstreamUrl,
                headers: {
                    'X-Widget-Signature': signature,
                    'X-Widget-Timestamp': timestamp
                },
                validateStatus: null // Capture all status codes
            });

            if (response.status !== 200) {
                request.log.error({ status: response.status, data: response.data }, '[History] Upstream fetch failed');
                return reply.code(502).send({ error: 'Failed to fetch history from backend' });
            }

            const result = response.data;

            if (result.messages) {
                // Pass-through everything, ONLY rewrite attachment URLs
                result.messages = result.messages.map(msg => {
                    if (msg.attachments && msg.attachments.length > 0) {
                        return {
                            ...msg,
                            attachments: rewriteAttachmentUrls(msg.attachments)
                        };
                    }
                    return msg;
                });
            }

            return { messages: result.messages || [] };

        } catch (error) {
            request.log.error({ err: error, sessionId }, 'Failed to fetch history');
            return reply.code(502).send({ error: 'Failed to fetch history from backend' });
        }
    });
}

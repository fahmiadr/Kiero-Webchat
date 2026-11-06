import { config } from '../config/index.js';
import axios from 'axios';

export default async function mediaRoutes(fastify) {
    fastify.get('/proxy/:type/:filename', async (request, reply) => {
        const { type, filename } = request.params;
        const agentUrl = config.agentRequest.agentBackendUrl;

        // Construct upstream URL
        // Construct upstream URL
        // Agent Backend path: /api/upload/download/{type}/{filename}
        const upstreamPath = `/api/upload/download/${type}/${filename}`;
        const upstreamUrl = `${agentUrl}${upstreamPath}`;

        fastify.log.info(`[MediaProxy] Proxying request: ${upstreamUrl}`);

        try {
            // Generate Signature
            const crypto = await import('crypto');
            const timestamp = Date.now().toString();
            // Sign: METHOD:URL:TIMESTAMP
            const stringToSign = `GET:${upstreamPath}:${timestamp}`;
            const signature = crypto
                .createHmac('sha256', config.webhook.secret)
                .update(stringToSign)
                .digest('hex');

            // Forward Range header if present
            const rangeHeader = request.headers.range;
            const headers = {
                'X-Widget-Signature': signature,
                'X-Widget-Timestamp': timestamp
            };
            if (rangeHeader) {
                headers['Range'] = rangeHeader;
            }

            const response = await axios({
                method: 'get',
                url: upstreamUrl,
                responseType: 'stream',
                headers: headers,
                validateStatus: (status) => status >= 200 && status < 300 // Accept 206 as success
            });

            // Forward headers
            const contentType = response.headers['content-type'];
            const contentLength = response.headers['content-length'];
            const contentRange = response.headers['content-range'];
            const acceptRanges = response.headers['accept-ranges'];

            if (contentType) reply.header('Content-Type', contentType);
            if (contentLength) reply.header('Content-Length', contentLength);
            if (contentRange) reply.header('Content-Range', contentRange);
            if (acceptRanges) reply.header('Accept-Ranges', acceptRanges);

            // Set Cache Control for performance
            reply.header('Cache-Control', 'public, max-age=31536000');

            // Forward the status code (essential for 206 Partial Content)
            reply.code(response.status);

            return reply.send(response.data);

        } catch (error) {
            fastify.log.error(`[MediaProxy] Failed to fetch from upstream: ${error.message}`);

            if (error.response) {
                return reply.status(error.response.status).send('Upstream error');
            }
            return reply.status(500).send('Proxy error');
        }
    });
}

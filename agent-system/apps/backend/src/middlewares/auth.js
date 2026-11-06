import prisma from '../config/prismaClient.js';
import { decrypt } from '../utils/security.js';
import { config } from '../config/index.js';

export async function authenticate(request, reply) {
    const authHeader = request.headers.authorization;

    // Check for Authorization header OR Widget Signature
    const widgetSignature = request.headers['x-widget-signature'];

    if ((!authHeader || !authHeader.startsWith('Bearer ')) && !widgetSignature) {
        return reply.code(401).send({ error: 'Authentication required (Bearer token or Widget Signature)' });
    }

    // Initialize token only if authHeader exists
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;

    // 1. Try JWT Verification (Internal Dashboard)
    try {
        await request.jwtVerify();
        // request.user is now populated by fastify-jwt
        return; // Success
    } catch (jwtErr) {
        // If JWT fails, it might be an API Key - proceed to Step 2
        request.log.debug({
            err: jwtErr.message,
            tokenPrefix: token ? token.substring(0, 5) : 'null'
        }, '[Auth] JWT verification failed, checking for API Key');
    }

    // 2. Try API Key Lookup (External Server)
    // Legacy support (check if token is NOT prefixed with wk_) ? 
    // Actually our new keys are wk_...
    // Let's implement the new logic.
    if (token) {
        try {
            // New Format: wk_<clientId>_<random>
            if (token.startsWith('wk_')) {
                const parts = token.split('_');
                // parts[0] = 'wk', parts[1] = clientId
                if (parts.length >= 2) {
                    const clientId = parts[1];
                    const client = await prisma.widgetClient.findUnique({
                        where: { clientId: clientId }
                    });

                    // Decrypt and compare
                    if (client && client.active && client.apiKey) {
                        const decryptedKey = decrypt(client.apiKey);
                        const isValid = decryptedKey === token;
                        if (isValid) {
                            request.user = {
                                id: `client-${client.clientId}`,
                                name: client.name,
                                role: 'external_server',
                                clientId: client.clientId,
                                allowedOrigins: client.allowedOrigins,
                                accounts: [client.clientId]
                            };
                            return;
                        }
                    }
                }
            } else {
                // FALLBACK: Legacy Plain Text (For migration period or dev)
                // Remove this in production if all keys are migrated
                const client = await prisma.widgetClient.findFirst({
                    where: { apiKey: token }
                });
                if (client && client.active) {
                    request.user = {
                        id: `client-${client.clientId}`,
                        name: client.name,
                        role: 'external_server',
                        clientId: client.clientId,
                        allowedOrigins: client.allowedOrigins,
                        accounts: [client.clientId]
                    };
                    return;
                }
            }
        } catch (dbErr) {
            request.log.error(dbErr, '[Auth] API Key lookup error');
        }
    }

    // 3. Try Widget Signature (HMAC)
    // Used for direct file downloads from Widget Backend
    const widgetTimestamp = request.headers['x-widget-timestamp'];

    if (widgetSignature && widgetTimestamp && config.webhookSecret) {
        try {
            const crypto = await import('crypto');

            // Replay protection (5 minutes)
            const now = Date.now();
            if (Math.abs(now - parseInt(widgetTimestamp)) > 5 * 60 * 1000) {
                return reply.code(401).send({ error: 'Request timestamp expired' });
            }

            // Construct string to sign: METHOD:PATH:TIMESTAMP (path only, no query string)
            const urlPath = new URL(request.url, 'http://localhost').pathname;
            const stringToSign = `${request.method}:${urlPath}:${widgetTimestamp}`;

            const expectedSignature = crypto
                .createHmac('sha256', config.webhookSecret)
                .update(stringToSign)
                .digest('hex');

            // Constant time comparison
            const sigBuf = Buffer.from(widgetSignature);
            const expBuf = Buffer.from(expectedSignature);

            if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
                request.user = {
                    id: 'widget-backend',
                    name: 'Widget Backend Proxy',
                    role: 'system',
                    accounts: []
                };
                return;
            }
        } catch (err) {
            request.log.warn({ err }, '[Auth] Signature verification failed');
        }
    }

    // 4. All failed
    return reply.code(401).send({ error: 'Invalid or expired token' });
}

export async function authorizeAdmin(request, reply) {
    if (!request.user || request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden: Admin access required' });
    }
}

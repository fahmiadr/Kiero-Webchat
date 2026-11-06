/**
 * Webhook Routes for Agent Backend
 * 
 * Receives events from:
 * 1. Widget Backend (via HTTP fallback, primarily BullMQ)
 * 2. External Servers (Unified Event Ingestion)
 */
import { authenticate } from '../middlewares/auth.js';
import prisma from '../config/prismaClient.js';
import { verifySignature } from '../services/signatureService.js';
import axios from 'axios';
import path from 'path';
import https from 'https';
import { MIME_TO_EXTENSION } from '../constants/fileTypes.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function webhookRoutes(fastify) {
    /**
     * POST /api/webhook/external
     * Unified Entry Point for External Server Events
     * Accepts: message:send, chat:handle, chat:close
     */
    fastify.post('/external', {
        preValidation: [authenticate],
        schema: {
            description: 'Unified event ingestion for external servers',
            body: {
                type: 'object',
                properties: {
                    event: { type: 'string', enum: ['message:send', 'chat:handle', 'chat:close', 'message:read', 'message:typing', 'chat:transfer'] },
                    payload: {
                        type: 'object',
                        properties: {
                            attachments: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        fileUrl: { type: 'string' }
                                    },
                                    required: ['fileUrl'],
                                    additionalProperties: true
                                }
                            }
                        },
                        // We allow additionalProperties: true here so we don't block
                        // the rest of payload properties like text, agentReplyTo, type, etc.
                        additionalProperties: true
                    }
                },
                required: ['event', 'payload']
            }
        }
    }, async (request, reply) => {
        const { event, payload } = request.body;
        const requestingUser = request.user;

        // === OPTIONAL: Incoming HMAC Verification ===
        const signature = request.headers['x-hub-signature'];
        // If signature is present, we attempt to verify it.
        // Failure results in a Warning log (Optional policy) rather than rejection, unless strict mode is desired.
        if (signature && requestingUser.clientId) {
            try {
                // Fetch secret for this client
                const client = await prisma.widgetClient.findUnique({
                    where: { clientId: requestingUser.clientId },
                    select: { webhookSecret: true }
                });

                if (client && client.webhookSecret) {
                    const isValid = verifySignature(request.body, signature, client.webhookSecret);

                    if (!isValid) {
                        request.log.warn({
                            clientId: requestingUser.clientId,
                            received: signature
                        }, '[Webhook] ⚠️ Invalid HMAC Signature (Proceeding due to optional policy)');
                    } else {
                        request.log.info({ clientId: requestingUser.clientId }, '[Webhook] ✅ HMAC Signature Verified');
                    }
                }
            } catch (err) {
                request.log.error({ err }, '[Webhook] Failed to verify signature');
            }
        }

        try {
            // Lazy load services
            const { InteractionService } = await import('../services/interactionService.js');
            const interactionService = new InteractionService(request.log, fastify.io);

            let result;

            switch (event) {
                case 'message:send':
                    // Auto-fill attachment metadata if external server only provides fileUrl without downloading
                    if (payload.attachments && Array.isArray(payload.attachments)) {
                        payload.attachments = await Promise.all(payload.attachments.map(async (att) => {
                            if (att.fileUrl && att.fileUrl.startsWith('http')) {
                                try {
                                    // HTTP HEAD request to probe content length and mime type without downloading the file
                                    const headRes = await axios.head(att.fileUrl, {
                                        timeout: 10000,
                                        // Allow self-signed certs (e.g. for internal/dev webhooks)
                                        httpsAgent: new https.Agent({
                                            rejectUnauthorized: false
                                        })
                                    }).catch(() => null);

                                    const urlWithoutQuery = att.fileUrl.split('?')[0];
                                    const parsedPath = path.posix.parse(urlWithoutQuery);



                                    const mimetype = headRes?.headers['content-type'] || 'application/octet-stream';
                                    const sizeStr = headRes?.headers['content-length'];
                                    const size = sizeStr ? parseInt(sizeStr, 10) : 0;

                                    const timestampSuffix = Date.now();
                                    const extension = parsedPath.ext || MIME_TO_EXTENSION[mimetype] || '.bin';
                                    const originName = parsedPath.ext
                                        ? parsedPath.base
                                        : `${parsedPath.name || 'unknown_file'}${extension}`;
                                    const uniqueFileName = `eksternal_${timestampSuffix}_${originName}`;

                                    const simpleCategory = payload.type || 'document';

                                    return {
                                        ...att,
                                        fileName: att.fileName || uniqueFileName,
                                        fileType: att.fileType || simpleCategory,
                                        fileSize: att.fileSize || size,
                                        fileOrigin: att.fileOrigin || originName,
                                        // duration / width / height bisa diambil secara spesifik dari head jika didukung server eksternalnya, 
                                        // namun secara general HEAD standar tidak membawanya. fallback ke {}
                                        meta: att.meta || {}
                                    };
                                } catch (e) {
                                    request.log.warn(`Failed to auto-fetch attachment info for: ${att.fileUrl}`);
                                    return att;
                                }
                            }
                            return att;
                        }));
                    }

                    const sendRes = await interactionService.sendMessage({
                        ...payload,
                        role: payload.agentRole
                    });
                    result = { messageId: sendRes.messageId };

                    // Audit log: Chat message from external source
                    fastify.auditLog?.log({
                        level: 'INFO',
                        source: 'external',
                        event: 'chat:message',
                        metadata: {
                            interactionId: payload.interactionId,
                            senderName: payload.agentName,
                            type: payload.type || 'text',
                            preview: (payload.content || '').substring(0, 50)
                        },
                        clientId: requestingUser.clientId,
                        ip: request.ip
                    });
                    break;

                case 'chat:handle':
                    // Payload: { interactionId, agentName }
                    if (!payload.interactionId || !payload.agentName) {
                        throw new Error('Missing interactionId or agentName');
                    }

                    // Unified Handling via InteractionService
                    await interactionService.handleChat({
                        ...payload,
                        role: payload.agentRole || 'external_server'
                    });
                    break;

                case 'chat:transfer':
                    // Payload: { interactionId, to?: { agentId, agentName, agentRole } }
                    if (!payload.interactionId) {
                        throw new Error('Missing interactionId');
                    }

                    // If payload.to is missing, targetAgentId will be undefined, which InteractionService handles as "Back to Queue"
                    await interactionService.transferChat({
                        interactionId: payload.interactionId,
                        agentId: payload.agentId || 'external',
                        targetAgentId: payload.to?.agentId,
                        targetAgentName: payload.to?.agentName,
                        targetAgentRole: payload.to?.agentRole
                    });
                    break;

                case 'chat:close':
                    // Payload: { interactionId }
                    if (!payload.interactionId) {
                        throw new Error('Missing interactionId');
                    }
                    await interactionService.closeChat({
                        interactionId: payload.interactionId,
                        closedBy: payload.agentId,
                        closedByName: payload.agentName,
                        closedRole: payload.agentRole,
                        closedReason: payload.reason
                    });
                    break;

                case 'message:read':
                    // Payload: { interactionId, messageIds }
                    if (!payload.interactionId) {
                        throw new Error('Missing interactionId');
                    }
                    if (!payload.messageIds || !Array.isArray(payload.messageIds)) {
                        throw new Error('Missing messageIds (array)');
                    }
                    await interactionService.markMessagesAsRead({
                        interactionId: payload.interactionId,
                        messageIds: payload.messageIds
                    });
                    break;

                case 'message:typing':
                    // Payload: { interactionId, isTyping, agentName }
                    if (!payload.interactionId) {
                        throw new Error('Missing interactionId');
                    }
                    await interactionService.sendTypingIndicator({
                        interactionId: payload.interactionId,
                        isTyping: payload.isTyping !== false, // Default to true if missing
                        agentName: payload.agentName,
                        agentId: payload.agentId,
                        agentRole: payload.agentRole || 'external_server'
                    });
                    break;

                default:
                    return reply.code(400).send({ error: 'Unsupported event type' });
            }

            return result ? { success: true, data: result } : { success: true };

        } catch (error) {
            request.log.error({ err: error, event }, 'External webhook processing failed');

            const statusCode = error.code ? 400 : 500;
            const responsePayload = {
                success: false,
                error: error.message || 'Processing failed'
            };

            if (error.code) {
                responsePayload.code = error.code;
                responsePayload.details = error.details;
            }

            return reply.code(statusCode).send(responsePayload);
        }
    });
}

export default webhookRoutes;

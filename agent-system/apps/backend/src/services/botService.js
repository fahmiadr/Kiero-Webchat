/**
 * Bot Service
 * 
 * Automated chat bot that handles:
 * - Welcome messages for new sessions
 * - Typing indicators
 * - Auto-replies based on keywords
 * - Agent handoff requests
 * - Message status simulation
 */
import { botConfig } from '../config/botConfig.js';
import { incomingEventQueue, backgroundTaskQueue } from '../queues/eventQueues.js';
import prisma from '../config/prismaClient.js';
import crypto from 'crypto';
import { storeAgentRequestedEvent, storeAgentAssignedEvent } from './systemEventService.js';
import { getWebhookDeliveryService } from './webhookDeliveryService.js';
import { resolveWelcomeMessage } from '../utils/timeHelper.js';

/**
 * BotService Class
 * 
 * Manages automated bot responses and agent handoff
 */
export class BotService {
    constructor(logger, io) {
        this.logger = logger;
        this.io = io;
        this.messageCounters = new Map(); // Track messages per interaction
        this.webhookService = getWebhookDeliveryService(logger);
    }

    /**
     * Send event to widget-backend via incoming queue
     * @param {string} type - Event type
     * @param {Object} payload - Event payload
     */
    async sendToWidget(type, payload) {
        try {
            await incomingEventQueue.add('incoming-event', { type, payload });
            this.logger.info(`[BotService] Queued: ${type}`);
        } catch (err) {
            this.logger.error({ err }, `[BotService] Failed to queue: ${type}`);
        }
    }

    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `BOT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Handle new chat session - send welcome message
     * Evaluates operating hours, holidays, and timezone before choosing the message.
     * @param {Object} sessionData - Session information
     */
    async handleNewSession(sessionData) {
        const { sessionId, interactionId, clientId, visitor } = sessionData;

        this.logger.info(`[BotService] New session: ${interactionId}`);

        // Fetch client-specific bot config
        const client = await prisma.widgetClient.findUnique({
            where: { clientId },
        });
        const clientBotConfig = client?.botConfig || {};

        // Resolve welcome message based on operating hours / holidays / timezone
        const { message: welcomeText, isOpen, reason } = resolveWelcomeMessage(
            clientBotConfig,
            botConfig.welcomeMessage
        );

        this.logger.info(
            `[BotService] Operating status for ${clientId}: isOpen=${isOpen}, reason=${reason}`
        );

        // Initialize message counter
        this.messageCounters.set(interactionId, 0);

        // Simulate typing before welcome message (Target sessionId to ensure immediate visibility)
        await this.simulateTyping(interactionId, clientId, sessionId);

        // Send the resolved welcome message
        const messageId = this.generateMessageId();
        await this.sendBotMessage(interactionId, clientId, messageId, welcomeText);

        this.logger.info(`[BotService] Welcome message sent to ${interactionId}`);
    }

    /**
     * Handle incoming message from user
     * @param {Object} messageData - Message information
     */
    async handleMessage(messageData) {
        const { interactionId, clientId, messageId, content } = messageData;

        this.logger.info(`[BotService] Received message in ${interactionId}: ${content?.substring(0, 50)}...`);

        // Check if session is waiting for agent (bot inactive)
        const interaction = await prisma.interaction.findUnique({
            where: { interactionId },
            include: { client: true }
        });

        if (!interaction) {
            this.logger.warn(`[BotService] Interaction not found: ${interactionId}`);
            return;
        }

        // If already assigned to agent or waiting, don't process
        if (!interaction.botActive) {
            this.logger.info(`[BotService] Bot inactive for ${interactionId}, skipping`);
            return;
        }

        // Increment message counter
        const count = (this.messageCounters.get(interactionId) || 0) + 1;
        this.messageCounters.set(interactionId, count);

        // Fetch client-specific bot config
        const clientBotConfig = interaction.client?.botConfig || {};
        const customKeywords = clientBotConfig.requestAgentKeywords || botConfig.requestAgentKeywords;
        const customAgentRequestedMessage = clientBotConfig.agentRequestedMessage || botConfig.agentRequestedMessage;
        const customSuggestAgentMessage = clientBotConfig.suggestAgentMessage || botConfig.suggestAgentMessage;

        // Check if business has closed since session started
        const { isOpen, message: closedText } = resolveWelcomeMessage(
            clientBotConfig,
            botConfig.welcomeMessage
        );

        if (!isOpen) { // Business is currently closed
            this.logger.info(`[BotService] Business is closed for ${interactionId}. Handled via closed message.`);

            // Mark visitor message as read first
            await this.delay(500);
            await this.sendMessageStatus(interactionId, clientId, messageId, 'read');
            await this.delay(500);

            // Simulate typing and send the closed message
            await this.simulateTyping(interactionId, clientId);
            const msgId = this.generateMessageId();
            await this.sendBotMessage(interactionId, clientId, msgId, closedText);
            return;
        }

        // Check for agent request keywords
        const lowerContent = content?.toLowerCase() || '';
        const wantsAgent = customKeywords.some(keyword =>
            lowerContent.includes(keyword.toLowerCase())
        );

        if (wantsAgent) {
            // Mark visitor message as read first
            await this.sendMessageStatus(interactionId, clientId, messageId, 'read');
            await this.requestAgent(interactionId, clientId, customAgentRequestedMessage);
            return;
        }

        // Check if max messages reached
        const maxBotMsgs = clientBotConfig.maxBotMessages || botConfig.maxBotMessages;
        if (count >= maxBotMsgs) {
            // Mark visitor message as read first
            await this.delay(500);
            await this.sendMessageStatus(interactionId, clientId, messageId, 'read');
            await this.delay(500);

            await this.simulateTyping(interactionId, clientId);
            const msgId = this.generateMessageId();
            await this.sendBotMessage(interactionId, clientId, msgId, customSuggestAgentMessage);
            return;
        }

        // Find matching auto-reply
        const response = this.findAutoReply(lowerContent);

        // Mark visitor message as read first (Sequence: Read -> Type -> Reply)
        await this.delay(500);
        await this.sendMessageStatus(interactionId, clientId, messageId, 'read');
        await this.delay(500);

        // Simulate typing
        await this.simulateTyping(interactionId, clientId);

        // Send bot response
        const responseMsgId = this.generateMessageId();
        await this.sendBotMessage(interactionId, clientId, responseMsgId, response);
    }

    /**
     * Find auto-reply based on message content
     * @param {string} content - Message content (lowercase)
     * @returns {string} Bot response
     */
    findAutoReply(content) {
        for (const rule of botConfig.autoReplies) {
            if (rule.triggers.some(trigger => content.includes(trigger))) {
                return rule.response;
            }
        }
        return botConfig.defaultResponse;
    }

    /**
     * Simulate typing indicator
     * @param {string} interactionId - Interaction ID
     * @param {string} clientId - Client ID
     * @param {string} targetRoom - Optional room to target (defaults to interactionId)
     */
    async simulateTyping(interactionId, clientId, targetRoom = null) {
        // Send typing:start
        await this.sendToWidget('bot:typing', {
            interactionId,
            clientId,
            isTyping: true,
            forceRoom: targetRoom // Pass fallback room to widget backend
        });

        // Wait for typing delay
        await this.delay(botConfig.delays.typing);

        // Wait a bit more for "composing"
        await this.delay(botConfig.delays.response - botConfig.delays.typing);

        // Send typing:stop
        await this.sendToWidget('bot:typing', {
            interactionId,
            clientId,
            isTyping: false,
            forceRoom: targetRoom
        });
    }

    /**
     * Send bot message to user
     */
    async sendBotMessage(interactionId, clientId, messageId, content) {
        // Store message in database
        await prisma.message.create({
            data: {
                messageId,
                interactionId,
                flagTo: 'customer', // Bot message TO customer
                senderType: 'bot',  // Sender is bot
                senderName: botConfig.name, // Store sender name
                message: content,
                messageType: 'text',
                flagRead: 0,
                flagSent: 1
            }
        });

        // Send message to widget
        await this.sendToWidget('bot:message', {
            interactionId,
            clientId,
            messageId,
            content,
            sender: 'bot',
            senderName: botConfig.name, // Dynamic Bot Name
            timestamp: new Date().toISOString()
        });

        // Also emit to agent dashboard (if agent is watching)
        if (this.io) {
            this.io.to(interactionId).emit('message:receive', {
                id: messageId,
                interactionId, // CRITICAL: Required for global listener
                content,
                type: 'text',
                sender: 'bot',
                senderName: botConfig.name, // Dynamic Bot Name
                timestamp: new Date().toISOString(),
                status: 'sent'
            });
        }
    }

    /**
     * User requests to speak with human agent
     */
    async requestAgent(interactionId, clientId, customAgentRequestedMessage) {
        this.logger.info(`[BotService] Agent requested for ${interactionId}`);

        // Update interaction status
        await prisma.interaction.update({
            where: { interactionId },
            data: {
                botActive: false,
                waitingAgent: true,
                queuedAt: new Date()
            }
        });

        // Store agent requested event in database

        // Send "connecting to agent" message
        await this.simulateTyping(interactionId, clientId);
        const msgId = this.generateMessageId();
        const msgContent = customAgentRequestedMessage || botConfig.agentRequestedMessage;
        await this.sendBotMessage(interactionId, clientId, msgId, msgContent);

        // Notify widget that user is in queue
        await this.sendToWidget('agent:waiting', {
            interactionId,
            clientId,
            queuePosition: await this.getQueuePosition(interactionId)
        });

        // Notify agent dashboard of new chat in queue
        if (this.io) {
            this.io.emit('interaction:update', {
                type: 'waiting_agent',
                interactionId
            });
        }
        await storeAgentRequestedEvent(interactionId);

        // Audit log: Agent requested
        const { getAuditLogService } = await import('./auditLogService.js');
        getAuditLogService().log({
            level: 'INFO',
            source: 'widget',
            event: 'agent:request',
            metadata: {
                interactionId,
                queuePosition: await this.getQueuePosition(interactionId)
            },
            clientId
        });

        // Forward to External Webhook (Requirement: Send History on Agent Request)
        // Fetch full history (Visitor & Bot)
        const history = await prisma.message.findMany({
            where: {
                interactionId,
                senderType: { in: ['visitor', 'bot'] } // Exclude system messages
            },
            orderBy: { createdAt: 'asc' },
            include: { attachments: true }
        });

        // Fetch interaction details for user info + client botConfig
        const interaction = await prisma.interaction.findUnique({
            where: { interactionId },
            include: { client: true }
        });

        try {

            if (history.length > 0) {
                const historyPayload = {
                    channel_id: clientId, // Renamed to channel_id for external compatibility, but its value is clientId
                    interaction_id: interactionId, // New field
                    messages: history.map(msg => {
                        const isBot = msg.senderType === 'bot';
                        const payload = {
                            id: msg.messageId,
                            is_bot: isBot,
                            from: {
                                id: isBot ? 'bot' : (interaction?.visitorId || 'visitor'),
                                name: isBot ? botConfig.name : (interaction?.name || 'Visitor'),
                                username: isBot ? 'bot@system' : (interaction?.email || 'visitor@email.com')
                            },
                            type: msg.messageType,
                            timestamp: Math.floor(msg.createdAt.getTime() / 1000)
                        };

                        if (msg.messageType === 'image' && msg.attachments.length > 0) {
                            const att = msg.attachments[0];
                            payload.image = {
                                fileurl: att.fileUrl,
                                caption: msg.message || '',
                                mime_type: att.fileType,
                                filename: att.fileName
                            };
                        } else {
                            payload.text = msg.message || '';
                        }
                        return payload;
                    })
                };

                await this.webhookService.forwardEvent(clientId, 'chat:history', historyPayload);
            }

            // ========== DELAYED JOB: Auto-close if no agent handles ==========
            const clientBotCfg = interaction?.client?.botConfig || {};
            const sessionTtlSeconds = clientBotCfg.sessionTtlSeconds || botConfig.sessionTtlSeconds;
            const rawTimeoutMinutes = clientBotCfg.agentWaitTimeoutMinutes || botConfig.agentWaitTimeoutMinutes;
            // Clamp: timeout must not exceed session TTL
            const clampedTimeoutMinutes = Math.min(rawTimeoutMinutes, sessionTtlSeconds / 60);
            const timeoutMessage = clientBotCfg.agentWaitTimeoutMessage || botConfig.agentWaitTimeoutMessage;

            const delayMs = clampedTimeoutMinutes * 60 * 1000;

            this.logger.info(
                { interactionId, timeoutMinutes: clampedTimeoutMinutes, delayMs },
                '[BotService] Scheduling auto-close delayed job'
            );

            backgroundTaskQueue.add('auto_close_waiting', {
                taskType: 'auto_close_waiting',
                payload: {
                    interactionId,
                    clientId,
                    closedReason: timeoutMessage
                }
            }, {
                delay: delayMs,
                jobId: `waitTimeout_${interactionId}`,
                removeOnComplete: true,
                removeOnFail: false
            }).catch(err => this.logger.error({ err }, '[BotService] Failed to schedule auto-close job'));

        } catch (error) {
            this.logger.error({ error: error.message, stack: error.stack }, '[BotService] CRITICAL EXCEPTION in requestAgent');
        }
    }

    /**
     * Get user's position in agent queue
     */
    async getQueuePosition(interactionId) {
        const waitingChats = await prisma.interaction.findMany({
            where: {
                waitingAgent: true,
                statusChat: 'open'
            },
            orderBy: { queuedAt: 'asc' }
        });

        const position = waitingChats.findIndex(c => c.interactionId === interactionId);
        return position >= 0 ? position + 1 : 1;
    }


    /**
     * Send message status update
     */
    async sendMessageStatus(interactionId, clientId, messageId, status) {
        await this.sendToWidget('message:status', {
            interactionId,
            clientId,
            messageId,
            status
        });
    }

    /**
     * Utility: delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
let botInstance = null;

export function getBotService(logger, io) {
    if (!botInstance) {
        botInstance = new BotService(logger, io);
    }
    return botInstance;
}

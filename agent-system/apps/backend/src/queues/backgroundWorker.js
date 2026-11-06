/**
 * Background Task Worker
 *
 * Fire-and-forget worker for non-critical operations:
 * - audit_log: Store audit log entries
 * - system_event: Store and notify system events
 * - redis_expire: Expire Redis session keys
 * - auto_close_waiting: Auto-close chats waiting for agents
 *
 * Wrapped in a factory function for proper Fastify lifecycle integration.
 * Failures are logged but non-blocking to API responses.
 */
import { Worker } from 'bullmq';
import { bullMqConnection, bullMqWorkerPresets } from '../config/index.js';
import { sharedRedisClient } from '../config/redisClient.js';
import { eventDlqQueue } from './eventQueues.js';

/**
 * Task Handlers
 */
const taskHandlers = {
    /**
     * Store audit log entry
     */
    async audit_log({ level, source, event, metadata, ip, clientId }) {
        const { getAuditLogService } = await import('../services/auditLogService.js');
        getAuditLogService().log({ level, source, event, metadata, ip, clientId });
    },

    /**
     * Store system event (agent assigned, chat closed, etc.)
     */
    async system_event({ eventType, interactionId, params }) {
        const systemEventService = await import('../services/systemEventService.js');

        switch (eventType) {
            case 'agent_assigned':
                await systemEventService.storeAgentAssignedEvent(interactionId, params.agentName);
                break;
            case 'chat_closed':
                await systemEventService.storeChatClosedEvent(interactionId);
                break;
            case 'chat_transferred':
                await systemEventService.storeChatTransferredEvent(interactionId, params.targetName);
                break;
            default:
                throw new Error(`Unknown system event type: ${eventType}`);
        }
    },

    /**
     * Expire Redis session keys.
     * Uses the shared singleton Redis client instead of creating a new connection per call.
     */
    async redis_expire({ keys, ttl = 60 }) {
        const pipeline = sharedRedisClient.pipeline();
        for (const key of keys) {
            pipeline.expire(key, ttl);
        }
        await pipeline.exec();
    },

    /**
     * Auto-close a chat that has been waiting for an agent beyond the configured timeout.
     * Guard: only closes if still waiting and open (idempotent).
     * Sends timeout message to visitor before closing.
     */
    async auto_close_waiting({ interactionId, clientId, closedReason }) {
        const prisma = (await import('../config/prismaClient.js')).default;
        const { botConfig } = await import('../config/botConfig.js');

        const interaction = await prisma.interaction.findUnique({ where: { interactionId } });

        if (!interaction) return;

        // Guard: only close if still waiting and open
        if (!interaction.waitingAgent || interaction.statusChat !== 'open') {
            return; // Already handled or closed — skip silently
        }

        const messageContent = closedReason || botConfig.agentWaitTimeoutMessage;

        // Store and send timeout message as a proper System Event
        const { storeSystemEvent } = await import('../services/systemEventService.js');
        await storeSystemEvent(interactionId, 'agent_timeout', messageContent);

        // Close the chat
        const { InteractionService } = await import('../services/interactionService.js');
        const interactionService = new InteractionService(console, null);

        await interactionService.closeChat({
            interactionId,
            closedBy: 'system',
            closedByName: 'System',
            closedReason: messageContent,
            closedRole: 'system'
        });
    }
};

/**
 * Starts the background task worker.
 * @param {object} logger - Pino logger instance
 * @returns {Worker} BullMQ Worker instance (for graceful shutdown)
 */
export function startBackgroundWorker(logger) {
    logger.info('[BackgroundWorker] Starting worker for background-tasks');
    const worker = new Worker('background-tasks', async (job) => {
        const { taskType, payload } = job.data;

        await job.log(`Processing background task: ${taskType}`);

        const handler = taskHandlers[taskType];
        if (!handler) {
            throw new Error(`Unknown task type: ${taskType}`);
        }

        await handler(payload);

        await job.log(`Task completed: ${taskType}`);
    }, {
        connection: bullMqConnection,
        ...bullMqWorkerPresets.background
    });

    worker.on('failed', async (job, err) => {
        if (!job) {
            logger.error({ error: err.message }, '[BackgroundWorker] Stalled job failed (no job context)');
            return;
        }

        if (job.attemptsMade >= job.opts.attempts) {
            await eventDlqQueue.add('failed-background-task', {
                jobId: job.id,
                queueName: job.queueName,
                originalJob: job.data,
                error: err.message,
                stackTrace: err.stack,
                attempts: job.attemptsMade,
                failedAt: new Date().toISOString()
            });
            logger.error({ jobId: job.id, taskType: job.data?.taskType }, '[BackgroundWorker] Job exhausted retries → moved to DLQ');
        }
    });

    worker.on('error', (err) => {
        logger.error({ err }, '[BackgroundWorker] Worker error');
    });

    return worker;
}

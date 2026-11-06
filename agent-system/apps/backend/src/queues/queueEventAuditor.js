/**
 * Queue Event Auditor
 * 
 * Listens to BullMQ QueueEvents for critical job failures
 * and logs them to the Audit Log system.
 */
import { QueueEvents } from 'bullmq';
import { bullMqConnection } from '../config/index.js';
import { getAuditLogService, LogLevel, LogSource } from '../services/auditLogService.js';

// Initialize QueueEvents listeners
let outgoingQueueEvents = null;
let dlqQueueEvents = null;

/**
 * Start the Queue Event Auditor.
 * Call this after the Audit Log Service is initialized.
 * @param {object} logger - Pino logger instance
 */
export function startQueueEventAuditor(logger) {
    const auditService = getAuditLogService();

    // Listen to outgoing-events queue
    outgoingQueueEvents = new QueueEvents('outgoing-events', { connection: bullMqConnection });

    outgoingQueueEvents.on('failed', ({ jobId, failedReason }) => {
        logger.error({ jobId, reason: failedReason }, '[QueueAuditor] Job failed in outgoing-events');

        auditService.log({
            level: LogLevel.ERROR,
            source: LogSource.QUEUE,
            event: 'queue:failed',
            metadata: {
                queueName: 'outgoing-events',
                jobId,
                error: failedReason
            }
        });
    });

    // Listen to DLQ for jobs moved there
    dlqQueueEvents = new QueueEvents('agent-events-dlq', { connection: bullMqConnection });

    dlqQueueEvents.on('added', ({ jobId, name }) => {
        logger.warn({ jobId, name }, '[QueueAuditor] Job moved to DLQ');

        auditService.log({
            level: LogLevel.CRITICAL,
            source: LogSource.QUEUE,
            event: 'queue:dlq',
            metadata: {
                queueName: 'agent-events-dlq',
                jobId,
                jobName: name
            }
        });
    });

    logger.info('[QueueAuditor] Started listening to queue events');
}

/**
 * Stop the Queue Event Auditor.
 * Call this during graceful shutdown.
 */
export async function stopQueueEventAuditor() {
    if (outgoingQueueEvents) {
        await outgoingQueueEvents.close();
    }
    if (dlqQueueEvents) {
        await dlqQueueEvents.close();
    }
}

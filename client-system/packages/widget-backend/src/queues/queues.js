/**
 * BullMQ Queue Definitions for Widget Backend (Client-System)
 *
 * All queues for the client-system are defined in this single file.
 * Connection and job options are centralized in config/index.js.
 *
 * Queue Flow:
 *   Widget Socket → [webhookQueue] → WebhookWorker → [outgoingEventQueue] → Agent-Backend
 *   Agent-Backend → [incomingEventQueue] → IncomingWorker → Widget Socket
 */
import { Queue } from 'bullmq';
import { bullMqConnection, bullMqJobPresets } from '../config/index.js';

// =========================================================================
// EVENT QUEUES
// =========================================================================

/**
 * Incoming events FROM agent-backend → processed by IncomingWorker
 * Events: message:receive, typing:agent, message:status, session:updated, bot:*, system:*
 */
export const incomingEventQueue = new Queue('incoming-events', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.standard
});

/**
 * Outgoing events TO agent-backend
 * Produced by WebhookWorker after signing, consumed by agent OutgoingWorker
 */
export const outgoingEventQueue = new Queue('outgoing-events', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.transient
});

/**
 * Internal webhook queue — enriches events with signatures before sending to agent
 * Produced by socket handlers + IncomingWorker, consumed by WebhookWorker
 */
export const webhookQueue = new Queue('webhook', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.standard
});

// =========================================================================
// DEAD LETTER QUEUES
// =========================================================================

/** DLQ for failed incoming events (from IncomingWorker) */
export const incomingDlqQueue = new Queue('incoming-events-dlq', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.dlq
});

/** DLQ for failed webhook events (from WebhookWorker) */
export const webhookDlqQueue = new Queue('webhook-dlq', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.dlq
});

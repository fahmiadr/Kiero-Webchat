/**
 * BullMQ Queue Definitions for Agent Backend
 *
 * All queues for the agent-system are defined in this single file.
 * Connection and job options are centralized in config/index.js.
 *
 * Queue Flow:
 *   Client [outgoing-events] → OutgoingWorker → DB + Bot + [incoming-events] → Client
 *                             → [webhook-events] → WebhookWorker → External HTTP
 *                             → [background-tasks] → BackgroundWorker → Audit/Redis/Events
 *   Client [agent_requests] → RequestWorker → DB → [agent_responses] → Client
 */
import { Queue } from 'bullmq';
import { bullMqConnection, bullMqJobPresets } from '../config/index.js';

// =========================================================================
// EVENT QUEUES
// =========================================================================

/**
 * Receives events FROM widget-backend (consumer: OutgoingWorker)
 * Events: new_chat, new_message, typing_message, read_message, chat_closed, message_delivered
 */
export const outgoingEventQueue = new Queue('outgoing-events', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.standard
});

/**
 * Sends responses back TO widget-backend (consumer: client IncomingWorker)
 * Events: session:updated, message:receive, message:status, typing:agent, bot:*, system:*
 */
export const incomingEventQueue = new Queue('incoming-events', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.transient
});

/**
 * Forwards events to external webhook endpoints (consumer: WebhookWorker)
 */
export const webhookQueue = new Queue('webhook-events', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.webhook
});

/**
 * Non-critical background tasks (consumer: BackgroundWorker)
 * Tasks: audit_log, system_event, redis_expire, auto_close_waiting
 */
export const backgroundTaskQueue = new Queue('background-tasks', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.background
});

/**
 * Request-response channel: sends responses from RequestWorker back to client AgentBroker
 */
export const responseQueue = new Queue('agent_responses', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.transient
});

// =========================================================================
// DEAD LETTER QUEUE
// =========================================================================

/**
 * Shared DLQ for all failed agent-system jobs
 * Consumed by queueEventAuditor for monitoring
 */
export const eventDlqQueue = new Queue('agent-events-dlq', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.dlq
});

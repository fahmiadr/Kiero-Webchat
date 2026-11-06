/**
 * System Event Service
 * 
 * Stores system events (chat opened, agent requested, etc.) as messages
 * so they persist AND sends them in real-time to widget.
 */
import prisma from '../config/prismaClient.js';
import crypto from 'crypto';
import { incomingEventQueue } from '../queues/eventQueues.js';

/**
 * System event types
 */
export const SystemEventType = {
    CHAT_OPENED: 'chat_opened',
    BOT_CONNECTED: 'bot_connected',
    AGENT_REQUESTED: 'agent_requested',
    AGENT_WAITING: 'agent_waiting',
    AGENT_ASSIGNED: 'agent_assigned',
    CHAT_TRANSFERRED: 'chat_transferred',
    CHAT_CLOSED: 'chat_closed'
};

/**
 * Store a system event as a message in the database AND send to widget in real-time
 * @param {string} interactionId - The interaction/chat ID
 * @param {string} eventType - Type of event (from SystemEventType)
 * @param {string} content - Message content to display
 * @returns {Promise<Object>} The created message
 */
export async function storeSystemEvent(interactionId, eventType, content) {
    const messageId = `SYS_${eventType}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // 1. Store in database for persistence
    const storedMessage = await prisma.message.create({
        data: {
            messageId,
            interactionId,
            flagTo: 'system',
            senderType: 'system',
            message: content,
            messageType: 'system',
            flagRead: 1,  // System messages are always "read"
            flagSent: 1
        }
    });

    // 2. Send to widget in real-time
    await incomingEventQueue.add('incoming-event', {
        type: 'system:message',
        payload: {
            interactionId,
            messageId,
            content,
            eventType,
            timestamp
        }
    });

    return storedMessage;
}

/**
 * Store bot connected event
 */
export async function storeBotConnectedEvent(interactionId, botName) {
    return storeSystemEvent(
        interactionId,
        SystemEventType.BOT_CONNECTED,
        `🤖 Terhubung dengan ${botName}`
    );
}

/**
 * Store agent requested event
 */
export async function storeAgentRequestedEvent(interactionId) {
    return storeSystemEvent(
        interactionId,
        SystemEventType.AGENT_REQUESTED,
        '⏳ Menunggu agent terhubung...'
    );
}

/**
 * Store agent assigned event
 */
export async function storeAgentAssignedEvent(interactionId, agentName) {
    return storeSystemEvent(
        interactionId,
        SystemEventType.AGENT_ASSIGNED,
        `👤 Terhubung dengan ${agentName}`
    );
}

/**
 * Store chat closed event
 */
export async function storeChatClosedEvent(interactionId) {
    return storeSystemEvent(
        interactionId,
        SystemEventType.CHAT_CLOSED,
        '💬 Chat ditutup'
    );
}

/**
 * Store chat transferred event
 */
export async function storeChatTransferredEvent(interactionId, targetName) {
    return storeSystemEvent(
        interactionId,
        SystemEventType.CHAT_TRANSFERRED,
        targetName
            ? `🔄 Chat ditransfer ke ${targetName}`
            : '🔄 Chat dikembalikan ke antrian'
    );
}


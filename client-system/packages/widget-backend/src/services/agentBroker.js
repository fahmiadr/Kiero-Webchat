/**
 * Agent Broker Service
 * 
 * Provides request-response communication with agent-backend via BullMQ.
 * All requests are signed with HMAC-SHA256 for authentication.
 */
import { Queue, Worker } from 'bullmq';
import { bullMqConnection, bullMqJobPresets, bullMqWorkerPresets, config } from '../config/index.js';
import { generateSignature } from './signatureService.js';
import crypto from 'crypto';

// Queue for sending requests to agent-backend
const requestQueue = new Queue('agent_requests', {
    connection: bullMqConnection,
    defaultJobOptions: bullMqJobPresets.transient
});

// Map to store pending request resolvers
const pendingRequests = new Map();

/**
 * AgentBroker - Request-Response pattern via BullMQ
 * All requests are signed for security
 */
export class AgentBroker {
    constructor(logger) {
        this.logger = logger;
        this.responseWorker = null;
    }

    /**
     * Initialize the response worker to listen for agent-backend responses
     */
    initialize() {
        this.responseWorker = new Worker('agent_responses', async (job) => {
            const { requestId, success, data, error } = job.data;

            const pending = pendingRequests.get(requestId);
            if (pending) {
                if (success) {
                    pending.resolve(data);
                } else {
                    // Extract message from error object if it's not a plain string
                    const errorMessage = typeof error === 'object' && error !== null ? (error.message || JSON.stringify(error)) : (error || 'Request failed');
                    const err = new Error(errorMessage);
                    // Attach the specific error string passed from agent-backend's worker
                    err.errorDetail = errorMessage;
                    pending.reject(err);
                }
                pendingRequests.delete(requestId);
            }

            return { processed: true };
        }, {
            connection: bullMqConnection,
            ...bullMqWorkerPresets.io
        });

        this.responseWorker.on('error', (err) => {
            this.logger?.error({ err }, '[AgentBroker] Response worker error');
        });

        this.logger?.info('[AgentBroker] Initialized with signature verification');
    }

    /**
     * Send a signed request to agent-backend and wait for response
     * @param {string} type - Request type (e.g., 'validate:client', 'fetch:history')
     * @param {Object} payload - Request payload
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<Object>} Response data
     */
    async request(type, payload, timeout = config.agentRequest.timeout) {
        const requestId = crypto.randomUUID();
        const timestamp = Date.now();

        // Create signable data (without signature)
        const signableData = {
            requestId,
            type,
            payload,
            timestamp
        };

        // Generate HMAC signature
        const signature = generateSignature(signableData);

        // Create promise that will be resolved by response worker
        const responsePromise = new Promise((resolve, reject) => {
            pendingRequests.set(requestId, { resolve, reject });

            // Timeout handler
            setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    pendingRequests.delete(requestId);
                    reject(new Error(`Request timeout: ${type}`));
                }
            }, timeout);
        });

        // Add signed job to request queue
        await requestQueue.add(type, {
            ...signableData,
            signature
        });

        this.logger?.info({ type, requestId }, '[AgentBroker] Signed request sent');

        return responsePromise;
    }

    /**
     * Validate a widget client via agent-backend
     * @param {string} clientId - The client/tenant identifier
     * @param {string} origin - Request origin for CORS validation
     * @returns {Promise<{valid: boolean, allowedOrigins?: string[], secret?: string}>}
     */
    async validateClient(clientId, origin) {
        try {
            // Payload MUST use clientId to match Agent Backend refactor
            const result = await this.request('validate:client', { clientId, origin });
            return result;
        } catch (error) {
            this.logger?.error({ clientId, origin, err: error }, '[AgentBroker] Client validation failed');
            // Differentiate explicit agent-backend rejection from internal failures
            const isExplicitRejection = !!error.errorDetail;
            return {
                valid: false,
                error: isExplicitRejection ? error.errorDetail : 'Validation service unavailable',
                errorType: isExplicitRejection ? 'INVALID_CLIENT_ID' : 'SERVICE_UNAVAILABLE'
            };
        }
    }

    /**
     * Fetch message history from agent-backend
     * @param {string} interactionId - The interaction/chat session ID
     * @returns {Promise<{messages: Array}>}
     */
    async fetchHistory(interactionId) {
        try {
            const result = await this.request('fetch:history', { interactionId });
            return result;
        } catch (error) {
            this.logger?.error({ interactionId, err: error }, '[AgentBroker] History fetch failed');
            return { messages: [], error: error.message };
        }
    }

    /**
     * Graceful shutdown
     */
    async close() {
        if (this.responseWorker) {
            await this.responseWorker.close();
        }
        await requestQueue.close();
    }
}

// Singleton instance
let brokerInstance = null;

export function getAgentBroker(logger) {
    if (!brokerInstance) {
        brokerInstance = new AgentBroker(logger);
        brokerInstance.initialize();
    }
    return brokerInstance;
}

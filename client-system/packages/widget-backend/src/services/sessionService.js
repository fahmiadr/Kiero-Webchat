/**
 * SessionService
 * 
 * TTL is strictly provided by the agent-system as the Single Source of Truth
 * via tenant config (socket.tenant.sessionTtlSeconds).
 */

export class SessionService {
    constructor(redis, ttl) {
        if (!ttl || ttl <= 0) {
            throw new Error(`Fatal Component Error: SessionService requires a strictly positive TTL injected from agent-system Validation Queue. Received: ${ttl}`);
        }
        this.redis = redis;
        this.ttl = Math.floor(ttl);
    }

    async createSession(sessionId, data) {
        const session = {
            sessionId,
            ...data,
            // ensure clientId is stored if passed in data
            status: 'open',
            createdAt: new Date().toISOString()
        };

        await this.redis.setex(
            `session:${sessionId}`,
            this.ttl,
            JSON.stringify(session)
        );

        return session;
    }

    async getSession(sessionId) {
        const data = await this.redis.get(`session:${sessionId}`);
        return data ? JSON.parse(data) : null;
    }

    async updateSession(sessionId, updates) {
        const session = await this.getSession(sessionId);
        if (!session) return null;

        const updated = { ...session, ...updates };
        await this.redis.setex(
            `session:${sessionId}`,
            this.ttl,
            JSON.stringify(updated)
        );

        return updated;
    }

    async mapSocketToSession(socketId, sessionId) {
        // Forward mapping: socketId → sessionId
        await this.redis.setex(`socket:${socketId}`, this.ttl, sessionId);
        // Reverse mapping: sessionId → socketId
        await this.redis.setex(`sessionSocket:${sessionId}`, this.ttl, socketId);
    }

    async getSocketBySession(sessionId) {
        return await this.redis.get(`sessionSocket:${sessionId}`);
    }

    async mapInteractionToSocket(interactionId, socketId) {
        await this.redis.setex(`interaction:${interactionId}`, this.ttl, socketId);
    }

    async getSocketByInteraction(interactionId) {
        return await this.redis.get(`interaction:${interactionId}`);
    }

    async closeSession(sessionId) {
        await this.updateSession(sessionId, { status: 'closed' });
    }
}


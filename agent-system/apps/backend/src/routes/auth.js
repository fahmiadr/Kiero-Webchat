import bcrypt from 'bcrypt';
import { SECURITY_CONFIG, TOKEN_CONFIG } from '../config/security.js';
import { authenticate } from '../middlewares/auth.js';
import prisma from '../config/prismaClient.js';
import crypto from 'crypto';

// Schemas
const loginSchema = {
    body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 }
        }
    }
};

async function authRoutes(fastify, options) {
    // Login Route
    fastify.post('/login', {
        schema: loginSchema,
        config: {
            rateLimit: SECURITY_CONFIG.RATE_LIMITS.LOGIN
        }
    }, async (request, reply) => {
        const { email, password } = request.body;

        try {
            const user = await prisma.user.findUnique({ where: { email } });

            if (!user) {
                // Log failed authentication
                fastify.auditLog?.log({
                    level: 'WARN',
                    source: 'agent',
                    event: 'auth:failed',
                    metadata: { reason: 'user_not_found', email },
                    ip: request.ip
                });
                return reply.code(401).send({ error: 'Invalid email or password' });
            }

            // Verify Password
            const validPassword = await bcrypt.compare(password, user.password);

            // Access for dev/seed data
            if (!validPassword) {
                // Log failed password
                fastify.auditLog?.log({
                    level: 'WARN',
                    source: 'agent',
                    event: 'auth:failed',
                    metadata: { reason: 'invalid_password', userId: user.id },
                    ip: request.ip
                });
                return reply.code(401).send({ error: 'Invalid email or password' });
            }

            // Generate Tokens using plugin helpers
            const familyId = crypto.randomUUID();
            const accessToken = fastify.generateAccessToken({ ...user, familyId });
            const refreshToken = fastify.generateRefreshToken({ ...user, familyId });

            // Store Refresh Token in Redis (7 Days TTL)
            // Key: refresh_token:userId:familyId
            await fastify.redis.set(
                `refresh_token:${user.id}:${familyId}`,
                refreshToken,
                'EX',
                TOKEN_CONFIG.REFRESH_TOKEN_TTL
            );

            // Log successful login
            fastify.auditLog?.log({
                level: 'INFO',
                source: 'agent',
                event: 'auth:login',
                metadata: { userId: user.id, email: user.email, role: user.role },
                ip: request.ip
            });

            return {
                accessToken,
                refreshToken, // Send refresh token in body
                user: { id: user.id, email: user.email, name: user.name, role: user.role }
            };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Refresh Token Route
    //
    // Uses atomic GETDEL + grace period to prevent race conditions:
    // 1. GETDEL atomically reads and deletes the stored token (no concurrent reads)
    // 2. Grace key caches the new token pair for 10s so concurrent requests
    //    receive the same response instead of triggering "Token reuse detected"
    fastify.post('/refresh', {
        config: {
            rateLimit: SECURITY_CONFIG.RATE_LIMITS.REFRESH
        },
        schema: {
            body: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                    refreshToken: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { refreshToken } = request.body;

        if (!refreshToken) {
            return reply.code(400).send({ error: 'Refresh token missing' });
        }

        try {
            // Verify Token (Plugin helper also checks type='refresh')
            const decoded = fastify.verifyRefreshToken(refreshToken);

            if (!decoded || !decoded.familyId) {
                return reply.code(403).send({ error: 'Invalid or expired refresh token' });
            }

            const key = `refresh_token:${decoded.id}:${decoded.familyId}`;
            const graceKey = `refresh_grace:${decoded.id}:${decoded.familyId}`;

            // ── Grace Period Check ──────────────────────────────
            // If a concurrent request already rotated this family within the last
            // 10 seconds, return the cached token pair instead of creating a new one.
            const graceData = await fastify.redis.get(graceKey);
            if (graceData) {
                request.log.info({ familyId: decoded.familyId }, '[Auth] Grace period hit — returning cached tokens');
                return JSON.parse(graceData);
            }

            // ── Atomic Token Retrieval ──────────────────────────
            // Using a Lua script for atomic GET-and-DELETE.
            // This is equivalent to GETDEL (Redis 6.2+) but compatible with older versions.
            const storedToken = await fastify.redis.eval(
                "local val = redis.call('GET', KEYS[1]) if val then redis.call('DEL', KEYS[1]) end return val",
                1,
                key
            );

            // 1. Token not in Redis → already consumed, expired, or revoked
            if (!storedToken) {
                return reply.code(403).send({ error: 'Session expired or revoked' });
            }

            // 2. Token mismatch → genuine reuse attempt (old token after rotation)
            if (storedToken !== refreshToken) {
                fastify.auditLog?.log({
                    level: 'CRITICAL',
                    source: 'agent',
                    event: 'auth:reuse_detected',
                    metadata: { userId: decoded.id, familyId: decoded.familyId },
                    ip: request.ip
                });

                return reply.code(403).send({ error: 'Security Alert: Token reuse detected. Session invalidated.' });
            }

            // ── Validate User ───────────────────────────────────
            const user = await prisma.user.findUnique({ where: { id: decoded.id } });
            if (!user) {
                return reply.code(403).send({ error: 'User access denied' });
            }

            // ── Rotate: generate new token pair ─────────────────
            const familyId = decoded.familyId;
            const newAccessToken = fastify.generateAccessToken({ ...user, familyId });
            const newRefreshToken = fastify.generateRefreshToken({ ...user, familyId });

            const REFRESH_TOKEN_TTL = TOKEN_CONFIG.REFRESH_TOKEN_TTL;
            const GRACE_PERIOD_TTL = 10; // seconds

            // Store new refresh token
            await fastify.redis.set(key, newRefreshToken, 'EX', REFRESH_TOKEN_TTL);

            // Cache the response for the grace period so concurrent
            // requests within 10s receive the same token pair
            const responseData = { accessToken: newAccessToken, refreshToken: newRefreshToken };
            await fastify.redis.set(graceKey, JSON.stringify(responseData), 'EX', GRACE_PERIOD_TTL);

            return responseData;

        } catch (error) {
            request.log.error(error);
            return reply.code(403).send({ error: 'Invalid refresh token' });
        }
    });

    // Logout Route
    fastify.post('/logout', {
        preValidation: [authenticate]
    }, async (request, reply) => {
        const userId = request.user?.id;
        const familyId = request.user?.familyId;

        if (userId && familyId) {
            // Invalidate Session in Redis
            await fastify.redis.del(`refresh_token:${userId}:${familyId}`);
        }

        // Audit logout event
        fastify.auditLog?.log({
            level: 'INFO',
            source: 'agent',
            event: 'auth:logout',
            metadata: { userId: userId, familyId },
            ip: request.ip
        });

        return { success: true };
    });

    // Verify Token Route (Me)
    fastify.get('/me', {
        preValidation: [authenticate]
    }, async (request, reply) => {
        try {
            // request.user is set by jwtVerify in authenticate middleware
            const user = await prisma.user.findUnique({
                where: { id: request.user.id }
            });

            if (!user) {
                return reply.code(404).send({ error: 'User not found' });
            }

            return {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                }
            };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // List Agents Route (For Transfer)
    fastify.get('/agents', {
        preValidation: [authenticate]
    }, async (request, reply) => {
        try {
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                }
            });
            return users;
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}

export default authRoutes;

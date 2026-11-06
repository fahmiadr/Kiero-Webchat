/**
 * Agent Backend Server Entry Point
 *
 * Starts the Fastify server. Workers are initialized inside buildApp()
 * with proper graceful shutdown via onClose hooks.
 */
import { buildApp } from './app.js';
import { config } from './config/index.js';

const start = async () => {
    try {
        const app = await buildApp();
        await app.listen({ port: config.port, host: '0.0.0.0' });
    } catch (err) {
        console.error('[Server] Failed to start:', err);
        process.exit(1);
    }
};

start();

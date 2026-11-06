import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
    level: config.logLevel,
    redact: {
        paths: ['password', 'token', 'authorization', '*.token', 'secret'],
        censor: '[REDACTED]'
    },
    transport: config.env === 'development'
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                ignore: 'pid,hostname', // Clean logs
                translateTime: 'HH:MM:ss Z', // Readable time
                messageFormat: '{msg}' // Focus on message
            }
        }
        : undefined,
    base: {
        service: 'widget-backend',
        env: config.env
    },
    timestamp: pino.stdTimeFunctions.isoTime
});

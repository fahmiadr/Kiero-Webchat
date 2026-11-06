import { config } from './index.js';

export const SECURITY_CONFIG = {
    RATE_LIMITS: {
        LOGIN: {
            max: config.security.rateLimits.login.max,
            timeWindow: config.security.rateLimits.login.window
        },
        REFRESH: {
            max: config.security.rateLimits.refresh.max,
            timeWindow: config.security.rateLimits.refresh.window
        },
        UPLOAD: {
            max: config.security.rateLimits.upload.max,
            timeWindow: config.security.rateLimits.upload.window
        },
        WIDGET_CLIENT: {
            max: config.security.rateLimits.widget.max,
            timeWindow: config.security.rateLimits.widget.window
        }
    }
};

export const TOKEN_CONFIG = {
    ACCESS_TOKEN_EXPIRY: config.security.tokens.accessExpiry,
    REFRESH_TOKEN_EXPIRY: config.security.tokens.refreshExpiry,
    REFRESH_TOKEN_TTL: config.security.tokens.refreshExpirySeconds
};

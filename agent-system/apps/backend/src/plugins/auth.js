import fp from 'fastify-plugin';

import { TOKEN_CONFIG } from '../config/security.js';

// We can leverage fastify-jwt which is already registered on 'app'
// But for separation of concerns, we can define helpers here.

async function authPlugin(app, options) {

    app.decorate('generateAccessToken', (user) => {
        return app.jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                familyId: user.familyId, // Added familyId
                type: 'access'
            },
            { expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY }
        );
    });

    app.decorate('generateRefreshToken', (user) => {

        return app.jwt.sign(
            {
                id: user.id,
                tokenVersion: user.tokenVersion || 0, // For rotation/invalidation
                familyId: user.familyId, // Added familyId
                type: 'refresh'
            },
            { expiresIn: TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY }
        );
    });

    app.decorate('verifyRefreshToken', (token) => {
        try {
            const decoded = app.jwt.verify(token);
            if (decoded.type !== 'refresh') {
                throw new Error('Invalid token type');
            }
            return decoded;
        } catch (err) {
            return null;
        }
    });
}

export default fp(authPlugin);

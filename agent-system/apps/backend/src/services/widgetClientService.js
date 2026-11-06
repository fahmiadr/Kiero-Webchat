import prisma from '../config/prismaClient.js';
import { generateNumericId, generateRandomString, encrypt, decrypt } from '../utils/security.js';

/** PostgreSQL int4 range: -2,147,483,648 to 2,147,483,647 */
const MAX_INT32 = 2_147_483_647;

/**
 * Safely parse an ID string to a valid PostgreSQL int4.
 * Returns -1 if the value is not a valid integer or exceeds int4 range,
 * so the OR-query falls through to the clientId string match.
 */
const safeParseInt = (id) => {
    const num = parseInt(id, 10);
    if (isNaN(num) || num > MAX_INT32 || num < -MAX_INT32) return -1;
    return num;
};

export class WidgetClientService {
    async getAll() {
        // Return clients but mask secrets
        const clients = await prisma.widgetClient.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Map to safe response (No secrets in list view)
        return clients.map(c => ({
            ...c,
            // Mask API Key. But wait, if we Hash it, we CANNOT restore it to even valid format unless we store prefix raw?
            // Actually, we store the Hash. We can't show "wk_clientId_****" if we only have the Hash.
            // But we know the clientId.
            apiKey: `wk_${c.clientId}_****** (Hidden)`,
            webhookSecret: c.webhookSecret ? '******' : null,   // Mask Webhook Secret
            webhookToken: c.webhookToken ? '******' : null,     // Mask Webhook Token
        }));
    }

    async getById(id) {
        const numericId = safeParseInt(id);
        const client = await prisma.widgetClient.findFirst({
            where: {
                OR: [
                    { id: isNaN(numericId) ? -1 : numericId },
                    { clientId: String(id) }
                ]
            }
        });
        if (!client) return null;

        return {
            ...client,
            apiKey: `wk_${client.clientId}_****** (Hidden)`,
            webhookSecret: '******',
            webhookToken: client.webhookToken ? '******' : null
        };
    }

    async create(data) {
        // 1. Generate Numeric Client ID (12 digits)
        let clientId = generateNumericId(12);
        // Ensure uniqueness
        let retries = 0;
        while (await prisma.widgetClient.findUnique({ where: { clientId } }) && retries < 5) {
            clientId = generateNumericId(12);
            retries++;
        }

        // 2. Generate RAW Secrets
        const rawApiKeySuffix = generateRandomString(16);
        const rawApiKey = `wk_${clientId}_${rawApiKeySuffix}`;
        const rawWebhookSecret = generateRandomString(32); // 32 bytes hex = 64 chars

        // 3. Encrypt all secrets
        const encryptedApiKey = encrypt(rawApiKey);
        const encryptedWebhookSecret = encrypt(rawWebhookSecret);

        // Handle Webhook Token (User Provided or Auto?)
        // If user provides it, we encrypt. If not, we can leave null (optional).
        let encryptedWebhookToken = null;
        if (data.webhookToken) {
            encryptedWebhookToken = encrypt(data.webhookToken);
        }

        const client = await prisma.widgetClient.create({
            data: {
                clientId,
                name: data.name,
                allowedOrigins: data.allowedOrigins || [],
                active: data.active ?? true,
                apiKey: encryptedApiKey, // Store Encrypted
                webhookUrl: data.webhookUrl,
                webhookSecret: encryptedWebhookSecret, // Store Encrypted
                webhookToken: encryptedWebhookToken // Store Encrypted
            }
        });

        // 4. Return RAW secrets ONLY ONCE
        // webhookToken is user provided, so no need to return it raw? 
        // Or if we auto-gen logic exists? No, user sets it.
        return {
            ...client,
            apiKey: rawApiKey,
            webhookSecret: rawWebhookSecret,
            // Don't return webhookToken, user knows it
        };
    }

    async update(id, data) {
        // Allowlist: only these fields can be changed via generic update
        const MUTABLE_FIELDS = ['name', 'allowedOrigins', 'active', 'webhookUrl', 'webhookToken'];

        const updateData = {};
        for (const field of MUTABLE_FIELDS) {
            if (field in data) {
                updateData[field] = data[field];
            }
        }

        // Handle Webhook Token encryption
        if (updateData.webhookToken) {
            updateData.webhookToken = encrypt(updateData.webhookToken);
        } else {
            // Empty/null means "no change" — don't overwrite existing value
            delete updateData.webhookToken;
        }

        const numericId = safeParseInt(id);
        const client = await prisma.widgetClient.findFirst({
            where: {
                OR: [
                    { id: isNaN(numericId) ? -1 : numericId },
                    { clientId: String(id) }
                ]
            }
        });

        if (!client) throw new Error('Client not found');

        const updatedClient = await prisma.widgetClient.update({
            where: { id: client.id },
            data: updateData
        });

        return {
            ...updatedClient,
            apiKey: `wk_${updatedClient.clientId}_****** (Hidden)`,
            webhookSecret: '******',
            webhookToken: updatedClient.webhookToken ? '******' : null
        };
    }

    async updateTheme(id, themeData) {
        const numericId = safeParseInt(id);
        const client = await prisma.widgetClient.findFirst({
            where: {
                OR: [
                    { id: isNaN(numericId) ? -1 : numericId },
                    { clientId: String(id) }
                ]
            }
        });

        if (!client) throw new Error('Client not found');

        const updatedClient = await prisma.widgetClient.update({
            where: { id: client.id },
            data: { theme: themeData }
        });

        return {
            ...updatedClient,
            apiKey: `wk_${updatedClient.clientId}_****** (Hidden)`,
            webhookSecret: '******',
            webhookToken: updatedClient.webhookToken ? '******' : null
        };
    }

    async updateBotConfig(id, botConfigData) {
        const numericId = safeParseInt(id);
        const client = await prisma.widgetClient.findFirst({
            where: {
                OR: [
                    { id: isNaN(numericId) ? -1 : numericId },
                    { clientId: String(id) }
                ]
            }
        });

        if (!client) throw new Error('Client not found');

        const updatedClient = await prisma.widgetClient.update({
            where: { id: client.id },
            data: { botConfig: botConfigData }
        });

        return {
            ...updatedClient,
            apiKey: `wk_${updatedClient.clientId}_****** (Hidden)`,
            webhookSecret: '******',
            webhookToken: updatedClient.webhookToken ? '******' : null
        };
    }

    async delete(id) {
        const numericId = safeParseInt(id);
        const client = await prisma.widgetClient.findFirst({
            where: {
                OR: [
                    { id: isNaN(numericId) ? -1 : numericId },
                    { clientId: String(id) }
                ]
            }
        });

        if (!client) throw new Error('Client not found');

        return prisma.widgetClient.delete({
            where: { id: client.id }
        });
    }

    async rotateApiKey(id) {
        const numericId = safeParseInt(id);
        const client = await prisma.widgetClient.findFirst({
            where: {
                OR: [
                    { id: isNaN(numericId) ? -1 : numericId },
                    { clientId: String(id) }
                ]
            }
        });
        if (!client) throw new Error('Client not found');

        const rawApiKeySuffix = generateRandomString(16);
        const rawApiKey = `wk_${client.clientId}_${rawApiKeySuffix}`;
        const encryptedApiKey = encrypt(rawApiKey);

        await prisma.widgetClient.update({
            where: { id: client.id },
            data: { apiKey: encryptedApiKey }
        });

        return { apiKey: rawApiKey }; // Return Raw Once
    }

    // New: Rotate Webhook Secret
    async rotateWebhookSecret(id) {
        const numericId = safeParseInt(id);
        const client = await prisma.widgetClient.findFirst({
            where: {
                OR: [
                    { id: isNaN(numericId) ? -1 : numericId },
                    { clientId: String(id) }
                ]
            }
        });
        if (!client) throw new Error('Client not found');

        const rawWebhookSecret = generateRandomString(32);
        const encryptedWebhookSecret = encrypt(rawWebhookSecret);

        await prisma.widgetClient.update({
            where: { id: client.id },
            data: { webhookSecret: encryptedWebhookSecret }
        });

        return { webhookSecret: rawWebhookSecret }; // Return Raw Once
    }

    /**
     * Reveals the decrypted API key for admin viewing
     * @param {number|string} id - Widget client DB id or clientId string
     * @returns {Promise<{apiKey: string}>}
     */
    async revealApiKey(id) {
        const numericId = safeParseInt(id);
        const client = await prisma.widgetClient.findFirst({
            where: {
                OR: [
                    { id: isNaN(numericId) ? -1 : numericId },
                    { clientId: String(id) }
                ]
            }
        });
        if (!client) throw new Error('Client not found');

        const decryptedApiKey = decrypt(client.apiKey);
        return { apiKey: decryptedApiKey };
    }
}

export default new WidgetClientService();

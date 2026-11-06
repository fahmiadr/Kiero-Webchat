import api from '@/lib/axios';

const widgetClientService = {
    /**
     * Get all widget clients
     * @returns {Promise<Array>}
     */
    getAll: async () => {
        const { data } = await api.get('/widget-clients');
        return data.data;
    },

    /**
     * Create a new widget client
     * @param {Object} clientData 
     * @returns {Promise<Object>}
     */
    create: async (clientData) => {
        const { data } = await api.post('/widget-clients', clientData);
        return data.data;
    },

    /**
     * Update a widget client
     * @param {string} id 
     * @param {Object} clientData 
     * @returns {Promise<Object>}
     */
    update: async (id, clientData) => {
        const { data } = await api.put(`/widget-clients/${id}`, clientData);
        return data.data;
    },

    /**
     * Delete a widget client
     * @param {string} id 
     * @returns {Promise<void>}
     */
    delete: async (id) => {
        await api.delete(`/widget-clients/${id}`);
    },

    /**
     * Rotate API Key
     * @param {string} id 
     * @returns {Promise<{apiKey: string}>}
     */
    rotateApiKey: async (id) => {
        const { data } = await api.post(`/widget-clients/${id}/rotate-key`);
        return data.data;
    },

    /**
     * Rotate Webhook Secret
     * @param {string} id 
     * @returns {Promise<{webhookSecret: string}>}
     */
    rotateWebhookSecret: async (id) => {
        const { data } = await api.post(`/widget-clients/${id}/rotate-secret`);
        return data.data;
    },

    /**
     * Reveal (decrypt) API Key for admin viewing
     * @param {string} id 
     * @returns {Promise<{apiKey: string}>}
     */
    revealApiKey: async (id) => {
        const { data } = await api.get(`/widget-clients/${id}/reveal-key`);
        return data.data;
    },

    /**
     * Get a specific widget client by ID (useful for theme builder)
     * @param {string} id
     * @returns {Promise<Object>}
     */
    getById: async (id) => {
        const { data } = await api.get(`/widget-clients/${id}`);
        return data.data;
    },

    /**
     * Update the theme configuration for a client
     * @param {string} id 
     * @param {Object} themeData 
     * @returns {Promise<Object>}
     */
    updateTheme: async (id, themeData) => {
        const { data } = await api.put(`/widget-clients/${id}/theme`, { theme: themeData });
        return data.data;
    },

    /**
     * Update the bot configuration for a client
     * @param {string} id
     * @param {Object} botConfigData
     * @returns {Promise<Object>}
     */
    updateBotConfig: async (id, botConfigData) => {
        const { data } = await api.put(`/widget-clients/${id}/bot-config`, { botConfig: botConfigData });
        return data.data;
    },

    /**
     * Preview bot config interpolation logic via backend
     * @param {string} id
     * @param {Object} botConfigData
     * @returns {Promise<Object>}
     */
    previewBotConfig: async (id, botConfigData) => {
        const { data } = await api.post(`/widget-clients/${id}/bot-config/preview`, { botConfig: botConfigData });
        return data.data;
    }
};

export default widgetClientService;

import api from '@/lib/axios';

const auditLogService = {
    // Fetch aggregated stats (24h)
    getStats: async (clientId) => {
        const { data } = await api.get('/logs/stats', {
            params: { clientId: clientId || undefined }
        });
        return data.data;
    },

    // Fetch heatmap data
    getHeatmap: async (hours = 24, clientId) => {
        const { data } = await api.get('/logs/heatmap', {
            params: { hours, clientId: clientId || undefined }
        });
        return data.data;
    },

    // Fetch paginated logs
    getLogs: async ({ pageParam = 0, filters }) => {
        const params = {
            limit: 50,
            offset: pageParam,
            ...filters
        };

        // Remove null/empty values
        Object.keys(params).forEach(key => {
            if (params[key] === null || params[key] === '') {
                delete params[key];
            }
        });

        const { data } = await api.get('/logs', { params });
        return data;
    },

    // Download logs as CSV
    downloadLogs: async (filters) => {
        const params = { ...filters };
        Object.keys(params).forEach(key => {
            if (params[key] === null || params[key] === '') {
                delete params[key];
            }
        });

        const response = await api.get('/logs/download', {
            params,
            responseType: 'blob'
        });
        return response.data;
    }
};

export default auditLogService;

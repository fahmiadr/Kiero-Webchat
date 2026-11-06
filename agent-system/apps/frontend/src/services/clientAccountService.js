import api from '@/lib/axios';

const clientAccountService = {
    getAll: async () => {
        const { data } = await api.get('/client-accounts');
        return data; // Backend returns array directly or { data: [] }? 
        // Backend `res.json(accounts)` -> array.
        // Frontend `socmedService` was returning `data.data`.
        // Let's check backend `res.json(accounts)`. It returns the array directly.
        // So `data` is the array.
    },

    create: async (accountData) => {
        const { data } = await api.post('/client-accounts', accountData);
        return data;
    },

    update: async ({ id, data: accountData }) => {
        // Need to unwrap { id, data } if passed as object to mutation
        const { data } = await api.put(`/client-accounts/${id}`, accountData);
        return data;
    },

    delete: async (id) => {
        await api.delete(`/client-accounts/${id}`);
    },

    // Alias for backward compatibility if needed, but better to update caller
    rotateApiKey: async (id) => {
        // Not implemented for ClientAccount yet? Or is this for WidgetClient?
        // WidgetClient has rotate. ClientAccount doesn't seem to have rotate logic in new/old service.
    }
};

export default clientAccountService;

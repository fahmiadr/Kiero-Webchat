import api from '@/lib/axios';

const socmedService = {
    getAll: async () => {
        const { data } = await api.get('/socmed');
        return data.data; // Assumes backend returns { success: true, data: [] }
    },

    create: async (accountData) => {
        const { data } = await api.post('/socmed', accountData);
        return data.data;
    },

    update: async (id, accountData) => {
        const { data } = await api.put(`/socmed/${id}`, accountData);
        return data.data;
    },

    delete: async (id) => {
        await api.delete(`/socmed/${id}`);
    }
};

export default socmedService;

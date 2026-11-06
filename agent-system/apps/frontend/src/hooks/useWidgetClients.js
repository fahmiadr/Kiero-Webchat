import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import widgetClientService from '@/services/widgetClientService';
import { useToast } from '@/hooks/use-toast';
import { useMemo } from 'react';

export const useWidgetClients = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: clients, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['widget-clients'],
        queryFn: widgetClientService.getAll
    });

    const createMutation = useMutation({
        mutationFn: (data) => widgetClientService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['widget-clients']);
            toast({ id: 'client-created', title: 'Client Created', description: 'Please save the credentials.' });
        },
        onError: (err) => {
            toast({
                id: 'client-create-error',
                title: 'Error',
                description: err.message || 'Failed to create client',
                variant: 'destructive'
            });
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => widgetClientService.update(id, data),
        onMutate: async ({ id, data }) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ['widget-clients'] });

            // Snapshot the previous value
            const previousClients = queryClient.getQueryData(['widget-clients']);

            // Optimistically update to the new value
            queryClient.setQueryData(['widget-clients'], (old) => {
                if (!old) return old;
                return old.map(client =>
                    client.id === id ? { ...client, ...data, updatedAt: new Date().toISOString() } : client
                );
            });

            // Return a context object with the snapshotted value
            return { previousClients };
        },
        onError: (err, variables, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousClients) {
                queryClient.setQueryData(['widget-clients'], context.previousClients);
            }
            toast({
                id: 'client-update-error',
                title: 'Error',
                description: err.message || 'Failed to update client',
                variant: 'destructive'
            });
        },
        onSettled: () => {
            // Always refetch after error or success to guarantee synchronization
            queryClient.invalidateQueries({ queryKey: ['widget-clients'] });
        },
        onSuccess: () => {
            toast({ id: 'client-updated', title: 'Success', description: 'Client updated successfully' });
        }
    });

    const updateBotConfigMutation = useMutation({
        mutationFn: ({ id, data }) => widgetClientService.updateBotConfig(id, data),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ['widget-clients'] });
            const previousClients = queryClient.getQueryData(['widget-clients']);

            queryClient.setQueryData(['widget-clients'], (old) => {
                if (!old) return old;
                return old.map(client =>
                    client.id === id ? { ...client, botConfig: { ...(client.botConfig || {}), ...data } } : client
                );
            });

            return { previousClients };
        },
        onError: (err, variables, context) => {
            if (context?.previousClients) {
                queryClient.setQueryData(['widget-clients'], context.previousClients);
            }
            toast({
                id: 'bot-config-error',
                title: 'Error',
                description: err.message || 'Failed to update bot configuration',
                variant: 'destructive'
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['widget-clients'] });
        },
        onSuccess: () => {
            toast({ id: 'bot-config-updated', title: 'Success', description: 'Bot configuration updated successfully' });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: widgetClientService.delete,
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['widget-clients'] });
            const previousClients = queryClient.getQueryData(['widget-clients']);

            queryClient.setQueryData(['widget-clients'], (old) => {
                if (!old) return old;
                return old.filter(client => client.id !== id);
            });

            return { previousClients };
        },
        onError: (err, variables, context) => {
            if (context?.previousClients) {
                queryClient.setQueryData(['widget-clients'], context.previousClients);
            }
            toast({
                id: 'client-delete-error',
                title: 'Error',
                description: err.message || 'Failed to delete client',
                variant: 'destructive'
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['widget-clients'] });
        },
        onSuccess: () => {
            toast({ id: 'client-deleted', title: 'Success', description: 'Client deleted successfully' });
        }
    });

    const rotateKeyMutation = useMutation({
        mutationFn: widgetClientService.rotateApiKey,
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['widget-clients'] });
            const previousClients = queryClient.getQueryData(['widget-clients']);

            // Since we don't know the new key yet, we just trigger a loading state in the UI
            // but keep the current data to avoid layout shift.
            return { previousClients };
        },
        onError: (err, variables, context) => {
            if (context?.previousClients) {
                queryClient.setQueryData(['widget-clients'], context.previousClients);
            }
            toast({ id: 'apikey-rotate-error', title: 'Error', description: 'Failed to rotate API Key', variant: 'destructive' });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['widget-clients'] });
        },
        onSuccess: () => {
            toast({ id: 'apikey-rotated', title: 'API Key Rotated', description: 'The API Key has been rotated.' });
        }
    });

    const rotateSecretMutation = useMutation({
        mutationFn: (id) => widgetClientService.rotateWebhookSecret(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['widget-clients'] });
            const previousClients = queryClient.getQueryData(['widget-clients']);
            return { previousClients };
        },
        onError: (err, variables, context) => {
            if (context?.previousClients) {
                queryClient.setQueryData(['widget-clients'], context.previousClients);
            }
            toast({ id: 'secret-rotate-error', title: 'Error', description: 'Failed to rotate Webhook Secret', variant: 'destructive' });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['widget-clients'] });
        },
        onSuccess: () => {
            toast({ id: 'secret-rotated', title: 'Webhook Secret Rotated', description: 'The Webhook Secret has been rotated.' });
        }
    });

    const updateThemeMutation = useMutation({
        mutationFn: ({ id, theme }) => widgetClientService.updateTheme(id, theme),
        onMutate: async ({ id, theme }) => {
            await queryClient.cancelQueries({ queryKey: ['widget-clients'] });
            const previousClients = queryClient.getQueryData(['widget-clients']);

            queryClient.setQueryData(['widget-clients'], (old) => {
                if (!old) return old;
                return old.map(client =>
                    client.id === id ? { ...client, theme: { ...(client.theme || {}), ...theme } } : client
                );
            });

            return { previousClients };
        },
        onError: (err, variables, context) => {
            if (context?.previousClients) {
                queryClient.setQueryData(['widget-clients'], context.previousClients);
            }
            toast({
                id: 'theme-update-error',
                title: 'Error',
                description: err.message || 'Failed to update theme',
                variant: 'destructive'
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['widget-clients'] });
        },
        onSuccess: () => {
            toast({ id: 'theme-updated', title: 'Success', description: 'Widget theme updated successfully' });
        }
    });

    const result = useMemo(() => ({
        clients: clients || EMPTY_ARRAY,
        isLoading,
        isError,
        error,
        refetch,
        createClient: createMutation.mutateAsync,
        updateClient: updateMutation.mutateAsync,
        deleteClient: deleteMutation.mutateAsync,
        rotateApiKey: rotateKeyMutation.mutateAsync,
        rotateWebhookSecret: rotateSecretMutation.mutateAsync,
        updateTheme: updateThemeMutation.mutateAsync,
        updateBotConfig: updateBotConfigMutation.mutateAsync,
        isCreating: createMutation.isPending,
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending,
        isRotatingKey: rotateKeyMutation.isPending,
        isRotatingSecret: rotateSecretMutation.isPending,
        isUpdatingTheme: updateThemeMutation.isPending,
        isUpdatingBotConfig: updateBotConfigMutation.isPending,
        revealApiKey: widgetClientService.revealApiKey,
        getById: widgetClientService.getById,
    }), [
        clients, isLoading, isError, error, refetch,
        createMutation.mutateAsync, createMutation.isPending,
        updateMutation.mutateAsync, updateMutation.isPending,
        deleteMutation.mutateAsync, deleteMutation.isPending,
        rotateKeyMutation.mutateAsync, rotateKeyMutation.isPending,
        rotateSecretMutation.mutateAsync, rotateSecretMutation.isPending,
        updateThemeMutation.mutateAsync, updateThemeMutation.isPending,
        updateBotConfigMutation.mutateAsync, updateBotConfigMutation.isPending
    ]);

    return result;
};

const EMPTY_ARRAY = [];


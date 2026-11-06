import React, { useState, useCallback } from 'react';
import { useWidgetClients } from '@/hooks/useWidgetClients';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

// Modular Components
import ClientHeader from '@/components/widget-client/ClientHeader';
import ClientTable from '@/components/widget-client/ClientTable';
import ClientForm from '@/components/widget-client/ClientForm';
import ClientCredentialRevealDialog from '@/components/widget-client/ClientCredentialRevealDialog';
import ClientConfirmationDialogs from '@/components/widget-client/ClientConfirmationDialogs';
import { WidgetClientError } from '@/components/widget-client/WidgetClientError';
import BotConfigSheet from '@/components/widget-client/BotConfigSheet';

const WidgetClients = () => {
    const {
        isLoading,
        isError,
        error,
        refetch,
        clients,
        createClient,
        updateClient,
        deleteClient,
        rotateApiKey,
        rotateWebhookSecret,
        revealApiKey,
        updateBotConfig
    } = useWidgetClients();

    // -- State Management --
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Bot Config State
    const [isBotConfigSheetOpen, setIsBotConfigSheetOpen] = useState(false);
    const [editingBotConfigClient, setEditingBotConfigClient] = useState(null);
    const [isSubmittingBotConfig, setIsSubmittingBotConfig] = useState(false);

    // Credential Reveal Dialog State
    const [credentialDialog, setCredentialDialog] = useState({
        open: false,
        title: '',
        description: '',
        credentials: []
    });

    // Delete Confirmation State
    const [deleteDialog, setDeleteDialog] = useState({
        open: false,
        clientId: null
    });


    // Rotation Loading States
    const [rotationState, setRotationState] = useState({
        key: false, // clientId if rotating
        secret: false // clientId if rotating
    });

    const navigate = useNavigate();

    // -- Handlers --

    const handleCreateClient = useCallback(() => {
        setEditingClient(null);
        setIsSheetOpen(true);
    }, []);

    const handleEditClient = useCallback((client) => {
        setEditingClient(client);
        setIsSheetOpen(true);
    }, []);

    const handleEditBotConfig = useCallback((client) => {
        setEditingBotConfigClient(client);
        setIsBotConfigSheetOpen(true);
    }, []);

    const handleFormSubmit = useCallback(async (values) => {
        setIsSubmitting(true);
        try {
            if (editingClient) {
                // Update
                const updateData = { ...values };
                // Only include webhookToken if it's set (to avoid overwriting with empty string if not intentioned)
                if (updateData.webhookToken === "") {
                    delete updateData.webhookToken;
                }

                await updateClient({ id: editingClient.id, data: updateData });
                setIsSheetOpen(false);
            } else {
                // Create
                const newClient = await createClient(values);
                setIsSheetOpen(false);

                // Show credentials
                setCredentialDialog({
                    open: true,
                    title: 'Client Created Successfully',
                    description: 'Here are the credentials for your substitute. Store them securely.',
                    credentials: [
                        { label: 'Client ID', value: newClient.clientId, isSecret: false },
                        { label: 'API Key', value: newClient.apiKey, isSecret: true },
                        { label: 'Webhook Secret', value: newClient.webhookSecret, isSecret: true }
                    ]
                });
            }
        } catch {
            // Error handled in hook or console
        } finally {
            setIsSubmitting(false);
        }
    }, [editingClient, updateClient, createClient]);

    const handleBotConfigSubmit = useCallback(async (clientId, values) => {
        setIsSubmittingBotConfig(true);
        try {
            await updateBotConfig({ id: clientId, data: values });
            setIsBotConfigSheetOpen(false);
        } catch {
            // Handled by hook
        } finally {
            setIsSubmittingBotConfig(false);
        }
    }, [updateBotConfig]);

    const handleDeleteRequest = useCallback((clientId) => {
        setDeleteDialog({ open: true, clientId });
    }, []);

    const confirmDelete = useCallback(async () => {
        if (!deleteDialog.clientId) return;
        try {
            await deleteClient(deleteDialog.clientId);
        } catch {
            // Handled by hook
        } finally {
            setDeleteDialog({ open: false, clientId: null });
        }
    }, [deleteClient, deleteDialog.clientId]);

    // Rotation Confirmation State
    const [rotateDialog, setRotateDialog] = useState({
        type: null, // 'key' | 'secret' | null
        clientId: null
    });

    const handleRotateKey = useCallback((clientId) => {
        setRotateDialog({ type: 'key', clientId });
    }, []);

    const handleRotateSecret = useCallback((clientId) => {
        setRotateDialog({ type: 'secret', clientId });
    }, []);

    const handleRevealApiKey = useCallback(async (clientId) => {
        return revealApiKey(clientId);
    }, [revealApiKey]);

    const handleNavigateToTheme = useCallback((clientId) => {
        navigate(`/widget-clients/${clientId}/theme`);
    }, [navigate]);

    const confirmRotate = useCallback(async () => {
        const { type, clientId } = rotateDialog;
        if (!type || !clientId) return;

        setRotationState(prev => ({ ...prev, [type]: clientId }));

        try {
            if (type === 'key') {
                const data = await rotateApiKey(clientId);
                setCredentialDialog({
                    open: true,
                    title: 'API Key Rotated',
                    description: 'The API Key has been refreshed. Please update your integration immediately.',
                    credentials: [
                        { label: 'New API Key', value: data.apiKey, isSecret: true }
                    ]
                });
            } else {
                const data = await rotateWebhookSecret(clientId);
                setCredentialDialog({
                    open: true,
                    title: 'Webhook Secret Rotated',
                    description: 'The Webhook Secret has been refreshed.',
                    credentials: [
                        { label: 'New Webhook Secret', value: data.webhookSecret, isSecret: true }
                    ]
                });
            }
        } catch {
            // Handled by hook
        } finally {
            setRotationState(prev => ({ ...prev, [type]: false }));
            setRotateDialog({ type: null, clientId: null });
        }
    }, [rotateApiKey, rotateDialog, rotateWebhookSecret]);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 p-2 sm:p-4 gap-2 sm:gap-4 overflow-y-auto md:overflow-hidden">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="shrink-0"
            >
                <ClientHeader onAddClient={handleCreateClient} />
            </motion.div>

            {/* Content */}
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex-1 flex gap-4 min-h-[50vh] md:min-h-0 overflow-hidden"
            >
                {isError ? (
                    <WidgetClientError error={error} onRetry={refetch} />
                ) : (
                    <ClientTable
                        clients={clients}
                        isLoading={isLoading}
                        isError={isError}
                        error={error}
                        onRetry={refetch}
                        onEdit={handleEditClient}
                        onEditBotConfig={handleEditBotConfig}
                        onRotateKey={handleRotateKey}
                        onRotateSecret={handleRotateSecret}
                        onDelete={handleDeleteRequest}
                        onAddClient={handleCreateClient}
                        onNavigateToTheme={handleNavigateToTheme}
                        emptyStateTitle="No Clients Found"
                        emptyStateDescription="Get started by creating your first widget client."
                        emptyActionLabel="Create Client"
                    />
                )}
            </motion.div>

            {/* Overlays */}

            {isSheetOpen && (
                <ClientForm
                    open={isSheetOpen}
                    onOpenChange={setIsSheetOpen}
                    client={clients.find(c => c.id === editingClient?.id) || editingClient}
                    onSubmit={handleFormSubmit}
                    isSubmitting={isSubmitting}
                    onRotateKey={handleRotateKey}
                    onRotateSecret={handleRotateSecret}
                    onRevealApiKey={handleRevealApiKey}
                    isRotatingKey={rotationState.key === editingClient?.id}
                    isRotatingSecret={rotationState.secret === editingClient?.id}
                />
            )}

            {isBotConfigSheetOpen && (
                <BotConfigSheet
                    open={isBotConfigSheetOpen}
                    onOpenChange={setIsBotConfigSheetOpen}
                    client={clients.find(c => c.id === editingBotConfigClient?.id) || editingBotConfigClient}
                    onSubmit={handleBotConfigSubmit}
                    isSubmitting={isSubmittingBotConfig}
                />
            )}

            {credentialDialog.open && (
                <ClientCredentialRevealDialog
                    open={credentialDialog.open}
                    onOpenChange={(open) => setCredentialDialog(prev => ({ ...prev, open }))}
                    title={credentialDialog.title}
                    description={credentialDialog.description}
                    credentials={credentialDialog.credentials}
                />
            )}

            {(deleteDialog.open || rotateDialog.type) && (
                <ClientConfirmationDialogs
                    deleteDialogState={deleteDialog}
                    setDeleteDialog={setDeleteDialog}
                    rotateDialogState={rotateDialog}
                    setRotateDialog={setRotateDialog}
                    onConfirmDelete={confirmDelete}
                    onConfirmRotate={confirmRotate}
                />
            )}
        </div>
    );
};

export default WidgetClients;

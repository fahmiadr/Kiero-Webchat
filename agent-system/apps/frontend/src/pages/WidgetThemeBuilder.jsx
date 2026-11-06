import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion } from 'motion/react';
import { useWidgetClients } from '@/hooks/useWidgetClients';
import { useToast } from '@/hooks/use-toast';
import { useThemeBuilderStore } from '@/stores/themeBuilderStore';
import { uploadService } from '@/services/uploadService';
import { config } from '@/config';

// Modular Components
import ThemeBuilderHeader from '@/components/theme-builder/ThemeBuilderHeader';
import ThemeBuilderComponentSelector from '@/components/theme-builder/ThemeBuilderComponentSelector';
import ThemeBuilderLoadingOverlay from '@/components/theme-builder/ThemeBuilderLoadingOverlay';
import ThemeBuilderLauncherSettings from '@/components/theme-builder/launcher';
import ThemeBuilderPreChatSettings from '@/components/theme-builder/prechat';
import ThemeBuilderPreview from '@/components/theme-builder/ThemeBuilderPreview';

const IFRAME_TIMEOUT_MS = 10_000;

const WidgetThemeBuilder = () => {
    const { clientId } = useParams();
    const navigate = useNavigate();

    const { getById, updateTheme, isUpdatingTheme } = useWidgetClients();
    const { toast } = useToast();
    const iframeRef = useRef(null);

    // Global Store State
    const themeConfig = useThemeBuilderStore((s) => s.themeConfig);
    const initTheme = useThemeBuilderStore((s) => s.initTheme);
    const updateNestedTheme = useThemeBuilderStore((s) => s.updateNestedTheme);
    const setServerThemeBaseline = useThemeBuilderStore((s) => s.setServerThemeBaseline);

    const [serverTheme, setServerTheme] = useState(null);
    const [iframeDefaults, setIframeDefaults] = useState(null);
    const defaultsReceivedRef = useRef(false);

    const [isLoadingClient, setIsLoadingClient] = useState(true);
    const [iframeError, setIframeError] = useState(false);
    const [selectedComponent, setSelectedComponent] = useState('launcher');

    // --- Iframe Communication ---

    // Timeout: if iframe doesn't send PREVIEW_DEFAULTS within threshold, show error
    useEffect(() => {
        if (themeConfig) return;

        const timer = setTimeout(() => {
            if (!defaultsReceivedRef.current) {
                setIframeError(true);
            }
        }, IFRAME_TIMEOUT_MS);

        return () => clearTimeout(timer);
    }, [themeConfig]);

    // Listen for PREVIEW_DEFAULTS from widget iframe
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data?.type === 'PREVIEW_DEFAULTS' && event.data?.defaults) {
                defaultsReceivedRef.current = true;
                setIframeError(false);
                setIframeDefaults(event.data.defaults);

                // Initialize store if we have both or just defaults
                initTheme(event.data.defaults, serverTheme);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [serverTheme, initTheme]);

    // Sync current state to iframe preview whenever themeConfig changes
    const syncIframeState = useCallback(() => {
        if (iframeRef.current?.contentWindow && themeConfig) {
            iframeRef.current.contentWindow.postMessage(
                { type: 'PREVIEW_THEME', theme: themeConfig },
                '*',
            );
            iframeRef.current.contentWindow.postMessage(
                { type: 'PREVIEW_VIEW', view: selectedComponent === 'prechat' ? 'open' : 'closed' },
                '*',
            );
        }
    }, [themeConfig, selectedComponent]);

    useEffect(() => {
        syncIframeState();
    }, [syncIframeState]);

    // --- Data Fetching ---

    useEffect(() => {
        const fetchClient = async () => {
            if (!clientId) return;
            setIsLoadingClient(true);
            try {
                const client = await getById(clientId);
                if (client?.theme) {
                    setServerTheme(client.theme);
                    // If iframe already sent defaults, re-init with server theme
                    if (defaultsReceivedRef.current) {
                        initTheme(iframeDefaults, client.theme);
                    }
                }
            } catch (error) {
                toast({
                    title: 'Error fetching client',
                    description: error.message,
                    variant: 'destructive',
                });
            } finally {
                setIsLoadingClient(false);
            }
        };
        fetchClient();
    }, [clientId, getById, toast, initTheme, iframeDefaults]);


    // --- Handlers ---

    /**
     * Process a single iconSettings object:
     * 1. Clean up the old uploaded image if it was abandoned.
     * 2. Upload a new base64 image and replace with a permanent URL.
     * Returns false if a critical upload failed and save should abort.
     */
    const processIconSettings = async (iconSettings, oldIconSettings) => {
        if (!iconSettings) return true;

        const UPLOAD_MARKER = '/api/upload/download/';
        const oldUrl = oldIconSettings?.imageUrl;
        const newUrl = iconSettings.imageUrl;
        const newType = iconSettings.type;

        // Step A: Cleanup abandoned old upload
        if (oldUrl && oldUrl.includes(UPLOAD_MARKER)) {
            const isAbandoned = newType !== 'custom' || newUrl !== oldUrl;
            if (isAbandoned) {
                try {
                    const relativePath = oldUrl.split(UPLOAD_MARKER)[1];
                    if (relativePath) await uploadService.deleteFile(relativePath);
                } catch (e) {
                    console.error('Failed to cleanup old custom icon:', e);
                }
            }
        }

        // Step B: Upload fresh base64 image
        if (newType === 'custom' && newUrl?.startsWith('data:')) {
            try {
                const res = await fetch(newUrl);
                const blob = await res.blob();
                const ext = blob.type.split('/')[1] || 'png';
                const file = new File([blob], `custom-icon.${ext}`, { type: blob.type });

                const uploadRes = await uploadService.upload(file, 'image');
                if (uploadRes.success && uploadRes.data?.urlPath) {
                    iconSettings.imageUrl = `${config.apiUrl}${uploadRes.data.urlPath}`;
                } else {
                    throw new Error('Upload server failed to return url');
                }
            } catch {
                return false; // Signal failure — caller should abort save
            }
        }

        return true; // Success
    };

    const handleSave = async () => {
        if (!themeConfig) return;
        try {
            // 1. Deep clone to avoid mutating store directly
            const finalThemeConfig = JSON.parse(JSON.stringify(themeConfig));

            // 2. Define all icon paths that need upload/cleanup processing
            const iconPaths = [
                {
                    current: finalThemeConfig.launcher?.launcherButton?.iconSettings,
                    old: serverTheme?.launcher?.launcherButton?.iconSettings,
                },
                {
                    current: finalThemeConfig.preChatForm?.header?.iconSettings,
                    old: serverTheme?.preChatForm?.header?.iconSettings,
                },
                {
                    current: finalThemeConfig.preChatForm?.header?.buttonSettings,
                    old: serverTheme?.preChatForm?.header?.buttonSettings,
                },
                {
                    current: finalThemeConfig.preChatForm?.welcomeMessage?.iconSettings,
                    old: serverTheme?.preChatForm?.welcomeMessage?.iconSettings,
                },
            ];

            // 3. Process all icon paths sequentially
            for (const { current, old } of iconPaths) {
                const success = await processIconSettings(current, old);
                if (!success) {
                    toast({
                        title: 'Upload Failed',
                        description: 'Gagal mengunggah gambar kustom. Coba kembali.',
                        variant: 'destructive',
                    });
                    return; // Abort save
                }
            }

            // 4. Save Final Theme
            await updateTheme({ id: clientId, theme: finalThemeConfig });

            // Re-sync serverTheme locally so future saves compare against correctly
            setServerTheme(finalThemeConfig);
            setServerThemeBaseline(finalThemeConfig);

            toast({
                title: 'Theme saved',
                description: 'The theme configuration has been updated successfully.',
            });
        } catch {
            // Error managed by hook
        }
    };

    const handleRetryIframe = useCallback(() => {
        setIframeError(false);
        defaultsReceivedRef.current = false;
        if (iframeRef.current) {
            const iframe = iframeRef.current;
            const currentSrc = iframe.src;
            iframe.src = '';
            requestAnimationFrame(() => { iframe.src = currentSrc; });
        }
    }, []);

    const isShowingOverlay = isLoadingClient || !themeConfig;

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 p-2 sm:p-4 gap-2 sm:gap-4 overflow-hidden">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="shrink-0"
            >
                <ThemeBuilderHeader
                    clientId={clientId}
                    onBack={() => navigate('/widget-clients')}
                    onSave={handleSave}
                    isSaving={isUpdatingTheme}
                    isSaveDisabled={isShowingOverlay || isUpdatingTheme}
                />
            </motion.div>

            {/* Main Content Area */}
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex flex-1 overflow-hidden relative border-2 rounded-md bg-slate-900 border-slate-800"
            >
                <ThemeBuilderLoadingOverlay
                    isLoading={isShowingOverlay}
                    hasError={iframeError}
                    onRetry={handleRetryIframe}
                />

                {/* Left Panel: Settings Editor */}
                <div className="w-[320px] shrink-0 flex flex-col border-r border-slate-800 z-10 shadow-xl relative">
                    <ThemeBuilderComponentSelector
                        selectedComponent={selectedComponent}
                        onSelect={setSelectedComponent}
                    />

                    {/* Editor Content Scroll Area */}
                    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 pb-24 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-button:vertical:start:decrement]:block [&::-webkit-scrollbar-button:vertical:start:decrement]:h-3.5 [&::-webkit-scrollbar-button:vertical:start:decrement]:bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%208%205%22%3E%3Cpath%20d%3D%22M0%205L4%200L8%205Z%22%20fill%3D%22%2364748b%22%2F%3E%3C%2Fsvg%3E')] [&::-webkit-scrollbar-button:vertical:start:decrement]:bg-no-repeat [&::-webkit-scrollbar-button:vertical:start:decrement]:bg-center [&::-webkit-scrollbar-button:vertical:start:decrement]:bg-contain [&::-webkit-scrollbar-button:vertical:end:increment]:block [&::-webkit-scrollbar-button:vertical:end:increment]:h-3.5 [&::-webkit-scrollbar-button:vertical:end:increment]:bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%208%205%22%3E%3Cpath%20d%3D%22M0%200L4%205L8%200Z%22%20fill%3D%22%2364748b%22%2F%3E%3C%2Fsvg%3E')] [&::-webkit-scrollbar-button:vertical:end:increment]:bg-no-repeat [&::-webkit-scrollbar-button:vertical:end:increment]:bg-center [&::-webkit-scrollbar-button:vertical:end:increment]:bg-contain">
                        {selectedComponent === 'launcher' && (
                            <ThemeBuilderLauncherSettings
                                themeConfig={themeConfig}
                                onUpdate={updateNestedTheme}
                            />
                        )}
                        {selectedComponent === 'prechat' && (
                            <ThemeBuilderPreChatSettings
                                themeConfig={themeConfig}
                                onUpdate={updateNestedTheme}
                            />
                        )}
                    </div>
                </div>

                {/* Right Panel: Live Preview */}
                <ThemeBuilderPreview
                    ref={iframeRef}
                    clientId={clientId}
                    onLoad={syncIframeState}
                />
            </motion.div>
        </div>
    );
};

export default WidgetThemeBuilder;

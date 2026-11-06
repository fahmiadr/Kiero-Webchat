import React, { memo, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Loader2, RotateCcw } from 'lucide-react';
import { useThemeBuilderStore } from '@/stores/themeBuilderStore';
import ResetConfirmationDialog from './shared/ResetConfirmationDialog';

const ThemeBuilderHeader = memo(({ clientId, onBack, onSave, isSaving, isSaveDisabled }) => {

    const themeConfig = useThemeBuilderStore(s => s.themeConfig);
    const serverTheme = useThemeBuilderStore(s => s.serverTheme);
    const resetAllToSaved = useThemeBuilderStore(s => s.resetAllToSaved);

    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

    // Compute if there are global dirty changes
    const hasGlobalChanges = useMemo(() => {
        if (!themeConfig || !serverTheme) return false;
        return JSON.stringify(themeConfig) !== JSON.stringify(serverTheme);
    }, [themeConfig, serverTheme]);

    return (
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 sm:gap-0 shrink-0">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onBack}
                    className="text-slate-400 hover:text-white hover:bg-slate-800"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
                        Theme Builder
                    </h1>
                    <p className="text-sm text-slate-500">
                        Client ID: {clientId}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
                <Button
                    onClick={() => setIsResetDialogOpen(true)}
                    disabled={isSaveDisabled || !hasGlobalChanges}
                    variant="outline"
                    className="bg-slate-700/40 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500 hover:text-white text-slate-200 w-full md:w-auto min-w-[120px]"
                >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Saved
                </Button>

                <Button
                    onClick={onSave}
                    disabled={isSaveDisabled}
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 w-full md:w-auto min-w-[120px]"
                >
                    {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    {isSaving ? 'Saving...' : 'Save Theme'}
                </Button>
            </div>

            <ResetConfirmationDialog
                isOpen={isResetDialogOpen}
                onClose={() => setIsResetDialogOpen(false)}
                onConfirm={resetAllToSaved}
                actionType="global_undo"
            />
        </div>
    );
});

export default ThemeBuilderHeader;

import React, { useState } from 'react';
import { RotateCcw, MonitorX } from 'lucide-react';
import { useThemeSetting } from '@/hooks/useThemeSetting';
import { useThemeBuilderStore } from '@/stores/themeBuilderStore';
import { getImpactedFields } from '@/utils/themeDiffUtils';
import ResetConfirmationDialog from './ResetConfirmationDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * Shared Header for Blocks (h2) and Fields (h3).
 * Visually displays a dirty dot and provides action buttons to undo or restore to default.
 * Handles triggering the confirmation dialog with impacted field computations.
 * 
 * @param {'block'|'field'} type 
 * @param {string} label - Human readable label (e.g. 'Background Color', 'Launcher Button')
 * @param {string} component - Theme component name (e.g. 'launcher')
 * @param {string} block - Theme block name (e.g. 'launcherButton') 
 * @param {string} [fieldKey] - Specific field key if type='field' (e.g. 'backgroundColor')
 */
const SettingHeader = ({ type = 'field', isSubBlock = false, label, component, block, fieldKey }) => {

    // Subscribe to specific piece of state to drive dirty UI
    const { activeValue, savedValue, defaultValue, isDirty } = useThemeSetting(component, block, fieldKey);
    const store = useThemeBuilderStore();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [actionType, setActionType] = useState('field_undo');
    const [impactedData, setImpactedData] = useState([]);

    const handleActionClick = (action) => {
        setActionType(action);
        let fields = [];

        // Formatting utilities for nice hierarchical breadcrumbs
        const formatKey = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const compStr = component ? formatKey(component) : '';
        const blockStr = block ? formatKey(block) : '';
        const parentPrefix = blockStr ? `${compStr} > ${blockStr}` : compStr;

        // Compute Impact
        if (action === 'field_undo') {
            let nestedPath = '';
            if (fieldKey) {
                const firstKey = Array.isArray(fieldKey) ? fieldKey[0] : fieldKey;
                const parts = firstKey.split('.');
                if (parts.length > 1) {
                    // Pull out sub-object paths like "iconSettings"
                    parts.pop();
                    nestedPath = parts.map(formatKey).join(' > ') + ' > ';
                }
            }
            fields = [`${parentPrefix} > ${nestedPath}${label}`];
        } else if (action === 'block_undo') {
            // Compare active block vs saved block
            const targetBlockName = isSubBlock ? `${blockStr} > ${label}` : blockStr;
            fields = getImpactedFields(activeValue, savedValue, compStr, targetBlockName);
        } else if (action === 'block_default') {
            // Compare active block vs default block
            const targetBlockName = isSubBlock ? `${blockStr} > ${label}` : blockStr;
            fields = getImpactedFields(activeValue, defaultValue, compStr, targetBlockName);
        }

        setImpactedData(fields);
        setDialogOpen(true);
    };

    const executeConfirmation = () => {
        if (actionType === 'field_undo') {
            if (Array.isArray(fieldKey)) {
                fieldKey.forEach(k => store.resetField(component, block, k));
            } else {
                store.resetField(component, block, fieldKey);
            }
        }
        if (actionType === 'block_undo') store.resetBlock(component, block, fieldKey);
        if (actionType === 'block_default') store.restoreDefaultBlock(component, block, fieldKey);
    };

    if (type === 'block') {
        const headerClasses = isSubBlock
            ? "flex items-center justify-between pb-2 group min-h-[24px]"
            : "flex items-center justify-between pb-1 mt-4 first:mt-0 group min-h-[24px]";

        const textClasses = isSubBlock
            ? "text-[11px] font-semibold text-blue-400 uppercase tracking-wider"
            : "text-xs font-bold uppercase tracking-widest text-slate-400";

        return (
            <div className={isSubBlock ? "mb-3" : ""}>
                <div className={headerClasses}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h2 className={`${textClasses} break-words line-clamp-2`} title={label}>
                            {label}
                        </h2>
                        <div className={`w-2 h-2 shrink-0 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)] transition-opacity duration-200 ${isDirty ? 'opacity-100' : 'opacity-0'}`} title={isDirty ? "Unsaved changes" : ""} />
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Undo to Saved */}
                        <div className={isDirty ? 'visible' : 'invisible'}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleActionClick('block_undo')}
                                        className="h-6 w-6 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Undo All Changes</TooltipContent>
                            </Tooltip>
                        </div>
                        {/* Restore System Default */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleActionClick('block_default')}
                                    className="h-6 w-6 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                                >
                                    <MonitorX className="w-3.5 h-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Restore System Default</TooltipContent>
                        </Tooltip>
                    </div>
                </div>

                {isSubBlock && <Separator className="bg-slate-700/80" />}

                <ResetConfirmationDialog
                    isOpen={dialogOpen}
                    onClose={() => setDialogOpen(false)}
                    onConfirm={executeConfirmation}
                    actionType={actionType}
                    impactedData={impactedData}
                />
            </div>
        );
    }

    // Field Type
    return (
        <div className="flex items-center justify-between mb-1 group min-h-[24px]">
            <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                <h3 className="text-xs font-semibold text-slate-200 break-words line-clamp-2" title={label}>
                    {label}
                </h3>
                <div className={`w-1.5 h-1.5 shrink-0 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)] transition-opacity duration-200 ${isDirty ? 'opacity-100' : 'opacity-0'}`} title={isDirty ? "Unsaved changes" : ""} />
            </div>

            <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className={isDirty ? 'visible' : 'invisible'}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleActionClick('field_undo')}
                                className="h-6 w-6 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Undo Change</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <ResetConfirmationDialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onConfirm={executeConfirmation}
                actionType={actionType}
                impactedData={impactedData}
            />
        </div>
    );
};

export default SettingHeader;

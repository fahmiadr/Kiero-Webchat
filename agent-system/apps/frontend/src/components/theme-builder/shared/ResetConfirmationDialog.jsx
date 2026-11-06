import React from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export const ResetConfirmationDialog = ({
    isOpen,
    onClose,
    onConfirm,
    actionType,
    impactedData = []
}) => {

    const config = {
        'field_undo': {
            title: 'Revert Field Changes?',
            description: 'This field will be reverted to its last saved value. Your recent modifications to this specific setting will be lost.',
            confirmText: 'Revert Field'
        },
        'block_undo': {
            title: 'Revert Block Changes?',
            description: 'All fields within this section will be reverted to their last saved state. Any unsaved modifications in this area will be discarded.',
            confirmText: 'Revert All Fields'
        },
        'block_default': {
            title: 'Restore Block to System Default?',
            description: 'WARNING: All fields in this section will be forced back to their original system default settings. Your saved data for this area will also be overwritten upon the next save.',
            confirmText: 'Restore Defaults'
        },
        'global_undo': {
            title: 'Discard All Theme Changes?',
            description: 'All unsaved drafts across all components and blocks will be permanently discarded. The theme will return exactly to its last saved state on the server.',
            confirmText: 'Discard Drafts & Revert'
        }
    };

    const currentConfig = config[actionType] || config.field_undo;

    return (
        <AlertDialog open={isOpen} onOpenChange={onClose}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{currentConfig.title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {currentConfig.description}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {impactedData.length > 0 && (
                    <div className="my-2 bg-slate-700/40 rounded-md p-3 max-h-[150px] overflow-y-auto w-full border border-slate-600">
                        <p className="text-xs font-semibold text-slate-400 mb-2">Impacted Fields:</p>
                        <ul className="text-xs text-slate-200 space-y-1 list-disc list-inside">
                            {impactedData.map((fieldPath, idx) => (
                                <li key={idx} className="flex items-start gap-2 truncate" title={fieldPath}>
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-red-400 shrink-0" />
                                    <span className="truncate">{fieldPath}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {impactedData.length === 0 && actionType !== 'global_undo' && (
                    <div className="my-2 p-2">
                        <p className="text-xs text-slate-400 italic">No significant changes detected.</p>
                    </div>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                    >
                        {currentConfig.confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default ResetConfirmationDialog;

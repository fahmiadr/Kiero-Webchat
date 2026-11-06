import { useRef, memo } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Handles confirmation dialogs for critical actions (Delete, Rotate Key, Rotate Secret)
 * to prevent cluttering the main parent component.
 */
const ClientConfirmationDialogs = memo(({
    deleteDialogState,
    setDeleteDialog,
    rotateDialogState,
    setRotateDialog,
    onConfirmDelete,
    onConfirmRotate
}) => {
    // Persist the type during closing animation to prevent text flashing
    const lastTypeRef = useRef(rotateDialogState.type);
    if (rotateDialogState.type) {
        lastTypeRef.current = rotateDialogState.type;
    }
    const effectiveType = rotateDialogState.type || lastTypeRef.current;

    return (
        <>
            {/* Delete Confirmation */}
            <AlertDialog open={deleteDialogState.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the widget client
                            and immediately revoke all access tokens. Any websites using this widget will stop working.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={onConfirmDelete}
                        >
                            Delete Client
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Rotation Confirmation */}
            <AlertDialog open={!!rotateDialogState.type} onOpenChange={(open) => !open && setRotateDialog({ type: null, clientId: null })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Rotate Credentials?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {effectiveType === 'key'
                                ? "Are you sure you want to rotate the API Key? The old key will stop working immediately, breaking any existing integrations until updated."
                                : "Are you sure you want to rotate the Webhook Secret? Signature verification will fail for old secrets immediately."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={onConfirmRotate}
                        >
                            Rotate {effectiveType === 'key' ? 'API Key' : 'Secret'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
});

export default ClientConfirmationDialogs;

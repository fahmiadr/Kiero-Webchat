import React, { useState, memo, useCallback } from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CredentialInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Copy, ShieldCheck, Download } from 'lucide-react';
import { copyToClipboard } from '@/utils/clipboard';

const CredentialItem = memo(({ cred }) => {
    const [isVisible, setIsVisible] = useState(false);

    const handleToggle = useCallback(() => {
        setIsVisible(prev => !prev);
    }, []);

    const handleCopy = useCallback(() => {
        copyToClipboard(cred.value, cred.label);
    }, [cred.value, cred.label]);

    return (
        <div className="space-y-1.5 group">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-0.5">
                {cred.label}
            </Label>
            <div className="mt-1 mb-2">
                <CredentialInput
                    readOnly
                    value={cred.isSecret && !isVisible ? '•'.repeat(40) : cred.value}
                    isVisible={isVisible}
                    onToggleVisibility={cred.isSecret ? handleToggle : undefined}
                    actionIcon={Copy}
                    actionLabel="Copy"
                    onActionClick={handleCopy}
                />
            </div>
        </div>
    );
});
CredentialItem.displayName = 'CredentialItem';

const ClientCredentialRevealDialog = memo(({ open, onOpenChange, title, description, credentials }) => {
    const handleDownload = () => {
        const content = credentials.map(c => `${c.label}: ${c.value}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'widget-credentials.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-500/10 rounded-full text-emerald-500 border border-emerald-500/20">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <AlertDialogTitle>
                            {title || 'Credentials Created'}
                        </AlertDialogTitle>
                    </div>
                    <AlertDialogDescription>
                        {description || 'Please copy these credentials now. For security reasons, they will not be shown again.'}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-4 flex gap-3 text-amber-200 mt-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <h5 className="font-medium leading-none tracking-tight text-amber-500">Security Warning</h5>
                        <div className="text-xs opacity-90 leading-relaxed text-amber-200/80">
                            These secrets are only visible <strong>once</strong>. If you lose them, you will need to regenerate them, which may break your existing integrations.
                        </div>
                    </div>
                </div>

                <div className="space-y-5 py-4">
                    {credentials?.map((cred) => (
                        <CredentialItem key={cred.label} cred={cred} />
                    ))}
                </div>

                <AlertDialogFooter className="sm:justify-between">
                    <Button
                        variant="outline"
                        onClick={handleDownload}
                        className="bg-slate-700/40 border-slate-600 hover:border-slate-500 hover:bg-slate-700/60 text-slate-200 hover:text-white w-full sm:w-auto gap-2 transition-all"
                    >
                        <Download className="h-4 w-4" />
                        Download .txt
                    </Button>
                    <AlertDialogAction
                        className="w-full sm:w-auto"
                        onClick={() => onOpenChange(false)}
                    >
                        I have saved them
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
});

export default ClientCredentialRevealDialog;

import { toast } from '@/hooks/use-toast';

/**
 * Copies text to the clipboard using the modern Async Clipboard API.
 * This removes reliance on the deprecated document.execCommand('copy').
 * Includes automatic Toast feedback.
 * 
 * Note: This requires a Secure Context (HTTPS or localhost).
 * 
 * @param {string} text - Text to copy
 * @param {string} [label='Content'] - Label for the toast message (e.g., 'Client ID')
 * @returns {Promise<void>}
 */
export const copyToClipboard = async (text, label = 'Content') => {
    if (!navigator.clipboard) {
        console.error('Clipboard API not available. Ensure you are context is secure (HTTPS or localhost).');
        toast({
            id: 'clipboard-error',
            title: 'Copy Failed',
            description: 'Clipboard API not available (Insecure Context)',
            variant: 'destructive',
        });
        return Promise.reject(new Error('Clipboard API unavailable'));
    }

    try {
        await navigator.clipboard.writeText(text);
        toast({
            id: `copied-${label}`,
            title: 'Copied',
            description: `${label} copied to clipboard`,
        });
    } catch (err) {
        console.error('Failed to copy to clipboard', err);
        toast({
            id: `copy-failed-${label}`,
            title: 'Error',
            description: `Failed to copy ${label}`,
            variant: 'destructive',
        });
        throw err;
    }
};

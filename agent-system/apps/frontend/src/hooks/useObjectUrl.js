import { useState, useEffect } from 'react';

/**
 * Custom hook to manage the lifecycle of an Object URL for a Blob or File.
 * 
 * Industry Standard Pattern:
 * - Separates the side-effect (URL creation/revocation) from the UI component.
 * - Handles proper cleanup to avoid memory leaks.
 * - Manages Strict Mode lifecycle correctly.
 * 
 * @param {Blob | File | null} blob - The blob object to create a URL for.
 * @returns {string | null} The object URL or null.
 */
// Module-level registry to ensure 1:1 mapping between Blob and URL
// WeakMap allows Blobs to be garbage collected if no longer referenced
const registry = new WeakMap();

/**
 * Imperatively get a URL for a blob, incrementing its ref count.
 * Useful for non-React contexts (e.g. file processing).
 * 
 * @param {Blob | File | null} blob - The blob object to acquire a URL for.
 * @returns {string | null} The object URL or null.
 */
export const acquireBlobUrl = (blob) => {
    if (!blob) return null;
    let entry = registry.get(blob);
    if (!entry) {
        entry = {
            url: URL.createObjectURL(blob),
            refCount: 0
        };
        registry.set(blob, entry);
    }
    entry.refCount++;
    if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
        entry.timeoutId = undefined;
    }
    return entry.url;
};

/**
 * Imperatively release a blob URL, decrementing its ref count.
 * Revocation is delayed to handle races.
 * 
 * @param {Blob | File | null} blob - The blob object whose URL is to be released.
 */
export const releaseBlobUrl = (blob) => {
    if (!blob) return;
    const entry = registry.get(blob);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
        entry.timeoutId = window.setTimeout(() => {
            if (entry.refCount <= 0) {
                URL.revokeObjectURL(entry.url);
                registry.delete(blob);
            }
        }, 500);
    }
};

export const useObjectUrl = (blob) => {
    const [objectUrl, setObjectUrl] = useState(null);

    useEffect(() => {
        if (!blob) {
            setObjectUrl(null);
            return;
        }

        const url = acquireBlobUrl(blob);
        setObjectUrl(url);

        return () => {
            releaseBlobUrl(blob);
        };
    }, [blob]);

    return objectUrl;
};

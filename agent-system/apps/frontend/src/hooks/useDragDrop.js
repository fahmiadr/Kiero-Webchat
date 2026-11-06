import { useState, useCallback, useRef } from 'react';

/**
 * Custom Hook for Industry Standard Drag and Drop
 * 
 * Features:
 * - Robust File Detection: Uses `dataTransfer.types` to distinguish files from text/elements.
 * - Flicker Prevention: Uses `dragCounter` pattern to handle child element events.
 * - UX Feedback: Sets `dropEffect = 'copy'` for visual cursor indication.
 * - State Management: Exposes `isDragging` for overlay rendering.
 * 
 * @param {Function} onDrop - Callback function receiving an array of File objects
 * @returns {Object} { isDragging, dragHandlers }
 */
export const useDragDrop = (onDrop) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragEnter = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;

        // Strict file check to avoid triggering on text drags
        const isFileDrag = e.dataTransfer.types && (
            Array.from(e.dataTransfer.types).includes('Files') ||
            e.dataTransfer.types.includes('Files')
        );

        if (isFileDrag) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        // UX Best Practice: Explicitly indicate a copy operation
        if (isDragging) {
            e.dataTransfer.dropEffect = 'copy';
        }
    }, [isDragging]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounterRef.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            onDrop(files);
            e.dataTransfer.clearData();
        }
    }, [onDrop]);

    return {
        isDragging,
        dragHandlers: {
            onDragEnter: handleDragEnter,
            onDragLeave: handleDragLeave,
            onDragOver: handleDragOver,
            onDrop: handleDrop
        }
    };
};

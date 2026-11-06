import { useMemo } from 'react';
import { useThemeBuilderStore } from '@/stores/themeBuilderStore';
import { getByPath as _get } from '@/utils/objectPath';
import { useShallow } from 'zustand/react/shallow';

/**
 * Custom hook to safely extract theme setting values and compute their dirty states.
 * Re-renders only when the specific value being watched changes.
 *
 * @param {string} component - Theme component name (e.g., 'launcher')
 * @param {string} [block] - Optional sub-block (e.g., 'launcherButton')
 * @param {string} [key] - Optional specific field key within the block. Can be dot-notation (e.g. 'titleSettings.color').
 */
export const useThemeSetting = (component, block, key) => {
    const isMulti = Array.isArray(key);

    // We selectively subscribe to the specific piece of state.
    // Zustand's default is strict equality (===).
    // For `isMulti` (array fieldKey), we MUST use useShallow, otherwise .map() creates a new array every render, causing an infinite loop.
    // For single fields (string fieldKey) or whole blocks (undefined fieldKey), we do not use useShallow, 
    // because returning an object from a selector will only cause a re-render if the object reference changes, 
    // which Zustand's immutable updates guarantee if a nested property changes.

    const activeValue = useThemeBuilderStore(
        isMulti
            ? useShallow((s) => key.map(k => _get(s.themeConfig, `${component}${block ? '.' + block : ''}.${k}`)))
            : (s) => {
                if (!s.themeConfig) return undefined;
                if (!key) return block ? s.themeConfig[component]?.[block] : s.themeConfig[component];
                return _get(s.themeConfig, `${component}${block ? '.' + block : ''}.${key}`);
            }
    );

    const savedValue = useThemeBuilderStore(
        isMulti
            ? useShallow((s) => key.map(k => _get(s.serverTheme, `${component}${block ? '.' + block : ''}.${k}`)))
            : (s) => {
                if (!s.serverTheme) return undefined;
                if (!key) return block ? s.serverTheme[component]?.[block] : s.serverTheme[component];
                return _get(s.serverTheme, `${component}${block ? '.' + block : ''}.${key}`);
            }
    );

    const defaultValue = useThemeBuilderStore(
        isMulti
            ? useShallow((s) => key.map(k => _get(s.defaultTheme, `${component}${block ? '.' + block : ''}.${k}`)))
            : (s) => {
                if (!s.defaultTheme) return undefined;
                if (!key) return block ? s.defaultTheme[component]?.[block] : s.defaultTheme[component];
                return _get(s.defaultTheme, `${component}${block ? '.' + block : ''}.${key}`);
            }
    );

    // Deep equate objects (like sub-blocks `iconSettings`) using stringify.
    // Shallow equate primitives. Array from isMulti is shallow equated by useMemo deps naturally if we stringify.
    const isDirty = useMemo(() => {
        if (activeValue === undefined || savedValue === undefined) return false;
        if (typeof activeValue === 'object') return JSON.stringify(activeValue) !== JSON.stringify(savedValue);
        return activeValue !== savedValue;
    }, [activeValue, savedValue]);

    const isModifiedFromDefault = useMemo(() => {
        if (activeValue === undefined || defaultValue === undefined) return false;
        if (typeof activeValue === 'object') return JSON.stringify(activeValue) !== JSON.stringify(defaultValue);
        return activeValue !== defaultValue;
    }, [activeValue, defaultValue]);

    return {
        activeValue,
        savedValue,
        defaultValue,
        isDirty,
        isModifiedFromDefault
    };
};

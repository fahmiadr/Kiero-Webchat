import { create } from 'zustand';
import { setByPath as _set, getByPath as _get } from '@/utils/objectPath';

/**
 * Deep-merges a partial theme object over the defaults.
 */
const deepMergeTheme = (defaults, overrides) => {
    if (!overrides) return { ...defaults };
    const result = { ...defaults };
    for (const key of Object.keys(overrides)) {
        if (
            typeof defaults[key] === 'object' &&
            defaults[key] !== null &&
            !Array.isArray(defaults[key]) &&
            typeof overrides[key] === 'object' &&
            overrides[key] !== null
        ) {
            result[key] = deepMergeTheme(defaults[key], overrides[key]);
        } else {
            result[key] = overrides[key];
        }
    }
    return result;
};

export const useThemeBuilderStore = create((set) => ({
    themeConfig: null,   // Active working draft
    serverTheme: null,   // Last saved state
    defaultTheme: null,  // System baseline defaults

    /**
     * Initializes the 3-tier state architecture
     */
    initTheme: (iframeDefaults, serverTheme) => {
        if (!iframeDefaults) return;
        set({
            defaultTheme: deepMergeTheme({}, iframeDefaults),
            serverTheme: serverTheme ? deepMergeTheme(iframeDefaults, serverTheme) : deepMergeTheme({}, iframeDefaults),
            themeConfig: serverTheme ? deepMergeTheme(iframeDefaults, serverTheme) : deepMergeTheme({}, iframeDefaults)
        });
    },

    /**
     * Updates a nested theme property. Supports dot-notation in `key`.
     */
    updateNestedTheme: (component, block, key, value) => {
        set((state) => {
            if (!state.themeConfig) return state;

            const next = { ...state.themeConfig };
            // Ensure objects exist
            next[component] = { ...(next[component] || {}) };

            if (block) {
                next[component][block] = { ...(next[component][block] || {}) };
                if (key.includes('.')) {
                    const topKey = key.split('.')[0];
                    if (next[component][block][topKey]) {
                        next[component][block][topKey] = { ...next[component][block][topKey] };
                    }
                }
                _set(next[component][block], key, value);
            } else {
                if (key.includes('.')) {
                    const topKey = key.split('.')[0];
                    if (next[component][topKey]) {
                        next[component][topKey] = { ...next[component][topKey] };
                    }
                }
                _set(next[component], key, value);
            }

            return { themeConfig: next };
        });
    },

    /**
     * Reset a specific field to its last saved value. Supports dot-notation in `key`.
     */
    resetField: (component, block, key) => {
        set((state) => {
            if (!state.themeConfig || !state.serverTheme) return state;

            const savedValue = block
                ? _get(state.serverTheme, `${component}.${block}.${key}`)
                : _get(state.serverTheme, `${component}.${key}`);

            const next = { ...state.themeConfig };
            // Ensure objects exist
            next[component] = { ...(next[component] || {}) };

            if (block) {
                next[component][block] = { ...(next[component][block] || {}) };
                if (key.includes('.')) {
                    const topKey = key.split('.')[0];
                    if (next[component][block][topKey]) {
                        next[component][block][topKey] = { ...next[component][block][topKey] };
                    }
                }
                _set(next[component][block], key, savedValue);
            } else {
                if (key.includes('.')) {
                    const topKey = key.split('.')[0];
                    if (next[component][topKey]) {
                        next[component][topKey] = { ...next[component][topKey] };
                    }
                }
                _set(next[component], key, savedValue);
            }

            return { themeConfig: next };
        });
    },

    /**
     * Reset an entire block (or a specific configured sub-block via fieldKey) to its last saved value.
     */
    resetBlock: (component, block, fieldKey) => {
        set((state) => {
            if (!state.themeConfig || !state.serverTheme) return state;

            const next = { ...state.themeConfig };

            if (fieldKey) {
                // If fieldKey is provided, we only want to reset that specific sub-object path.
                // E.g., block="launcherButton", fieldKey="iconSettings"
                next[component] = { ...(next[component] || {}) };
                next[component][block] = { ...(next[component][block] || {}) };

                // If it's an array of sub-fields (like IconOptionGroup), reset them all
                const keys = Array.isArray(fieldKey) ? fieldKey : [fieldKey];
                keys.forEach(k => {
                    const savedSubBlock = block ? _get(state.serverTheme, `${component}.${block}.${k}`) : _get(state.serverTheme, `${component}.${k}`);
                    if (savedSubBlock !== undefined) {
                        const mergedSubBlock = typeof savedSubBlock === 'object' && savedSubBlock !== null && !Array.isArray(savedSubBlock)
                            ? deepMergeTheme({}, savedSubBlock)
                            : savedSubBlock;
                        if (block) {
                            _set(next[component][block], k, mergedSubBlock);
                        } else {
                            _set(next[component], k, mergedSubBlock);
                        }
                    } else { // Handle undefined reset (clearing properties that don't exist in serverTheme)
                        if (block) {
                            _set(next[component][block], k, undefined);
                        } else {
                            _set(next[component], k, undefined);
                        }
                    }
                });
            } else if (block) {
                // Determine if component exists, otherwise create empty object
                const nextComponent = next[component] || {};
                // Override the entire block object with the saved equivalent
                const savedBlock = state.serverTheme[component]?.[block] || {};
                next[component] = {
                    ...nextComponent,
                    [block]: deepMergeTheme({}, savedBlock)
                };
            } else {
                const savedComponent = state.serverTheme[component] || {};
                next[component] = deepMergeTheme({}, savedComponent);
            }
            return { themeConfig: next };
        });
    },

    /**
     * Restore an entire block (or a specific configured sub-block via fieldKey) to the system default value.
     */
    restoreDefaultBlock: (component, block, fieldKey) => {
        set((state) => {
            if (!state.themeConfig || !state.defaultTheme) return state;

            const next = { ...state.themeConfig };

            if (fieldKey) {
                next[component] = { ...(next[component] || {}) };
                next[component][block] = { ...(next[component][block] || {}) };

                const keys = Array.isArray(fieldKey) ? fieldKey : [fieldKey];
                keys.forEach(k => {
                    const defaultSubBlock = block ? _get(state.defaultTheme, `${component}.${block}.${k}`) : _get(state.defaultTheme, `${component}.${k}`);
                    if (defaultSubBlock !== undefined) {
                        const mergedSubBlock = typeof defaultSubBlock === 'object' && defaultSubBlock !== null && !Array.isArray(defaultSubBlock)
                            ? deepMergeTheme({}, defaultSubBlock)
                            : defaultSubBlock;
                        if (block) {
                            _set(next[component][block], k, mergedSubBlock);
                        } else {
                            _set(next[component], k, mergedSubBlock);
                        }
                    } else {
                        if (block) {
                            _set(next[component][block], k, undefined);
                        } else {
                            _set(next[component], k, undefined);
                        }
                    }
                });
            } else if (block) {
                const nextComponent = next[component] || {};
                const defaultBlock = state.defaultTheme[component]?.[block] || {};
                next[component] = {
                    ...nextComponent,
                    [block]: deepMergeTheme({}, defaultBlock)
                };
            } else {
                const defaultComponent = state.defaultTheme[component] || {};
                next[component] = deepMergeTheme({}, defaultComponent);
            }
            return { themeConfig: next };
        });
    },

    /**
     * Globally reset the active draft entirely to match the last saved state.
     */
    resetAllToSaved: () => {
        set((state) => {
            if (!state.serverTheme) return state;
            return { themeConfig: deepMergeTheme({}, state.serverTheme) };
        });
    },

    /**
     * Replaces the active draft config.
     */
    setThemeConfig: (newTheme) => set({ themeConfig: newTheme }),

    /**
     * Manually update the serverTheme baseline tracking after a successful network save.
     */
    setServerThemeBaseline: (newServerTheme) => set({ serverTheme: newServerTheme }),
}));


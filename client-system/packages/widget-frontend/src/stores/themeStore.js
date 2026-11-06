import { create } from 'zustand';
import { DEFAULT_THEME_CONFIG } from '@/constants/defaultThemeConfig';

/**
 * Deep-merges a partial theme object over the defaults.
 * Handles nested sections (e.g., preChatForm.header) gracefully.
 *
 * @param {object} defaults - The full default theme config.
 * @param {object} overrides - Partial theme from server or postMessage.
 * @returns {object} Fully-populated theme config.
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

/**
 * Theme Store — Dedicated Zustand store for widget theme configuration.
 *
 * Responsibilities:
 * - Holds the fully-populated theme (defaults merged with overrides).
 * - Provides granular selectors for each component section.
 * - Replaces config/setConfig from chatStore.
 */
export const useThemeStore = create((set) => ({
  theme: { ...DEFAULT_THEME_CONFIG },

  /**
   * Sets the theme by deep-merging overrides over the canonical defaults.
   * This ensures every property always has a value even if the server
   * only stores a partial override.
   *
   * @param {object} themeOverrides - Partial theme object.
   */
  setTheme: (themeOverrides) =>
    set({ theme: deepMergeTheme(DEFAULT_THEME_CONFIG, themeOverrides) }),
}));

// --- Granular Selectors ---
export const useLauncherButtonTheme = () => useThemeStore((s) => s.theme.launcher.launcherButton);

export const usePreChatFormTheme = () => useThemeStore((s) => s.theme.preChatForm);

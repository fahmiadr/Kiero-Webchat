/**
 * Detects whether the widget is running in Theme Builder preview mode.
 *
 * Priority:
 * 1. URL search param `?preview=true` (used in dev mode with `src` iframe)
 * 2. Script tag `data-preview="true"` (used in prod mode with `srcdoc` iframe)
 *
 * The result is cached after the first call for consistency.
 */
const detectPreviewMode = () => {
  const fromUrl = new URLSearchParams(window.location.search).get('preview') === 'true';

  if (fromUrl) return true;

  const script = document.currentScript || document.querySelector('script[data-preview]');
  return script?.getAttribute('data-preview') === 'true';
};

/** Cached preview flag — evaluated once at module load time */
export const IS_PREVIEW = detectPreviewMode();

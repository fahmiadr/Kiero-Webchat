// Map Tailwind font-weight classes to CSS font-weight values
const FONT_WEIGHT_MAP = {
  'font-thin': 100,
  'font-extralight': 200,
  'font-light': 300,
  'font-normal': 400,
  'font-medium': 500,
  'font-semibold': 600,
  'font-bold': 700,
  'font-extrabold': 800,
  'font-black': 900,
};

/**
 * Converts typography settings object into CSS inline styles.
 *
 * @param {object} settings - Typography settings from theme config.
 * @param {string} settings.fontWeight - Tailwind weight class (e.g. 'font-semibold').
 * @param {number} settings.fontSize - Numeric font size value.
 * @param {string} settings.fontSizeUnit - CSS unit ('px' | 'rem').
 * @param {boolean} settings.italic - Whether to apply italic style.
 * @returns {{ fontWeight: number, fontSize: string, fontStyle: string }}
 */
export const buildFontStyle = (settings = {}) => {
  const {
    fontWeight = 'font-normal',
    fontSize = 14,
    fontSizeUnit = 'px',
    italic = false,
  } = settings;
  return {
    fontWeight: FONT_WEIGHT_MAP[fontWeight] ?? 400,
    fontSize: `${fontSize}${fontSizeUnit}`,
    fontStyle: italic ? 'italic' : 'normal',
  };
};

/**
 * Extracts a solid base shadow color from a background string.
 * Helpful for generating CSS box-shadows when the background is a gradient.
 *
 * @param {string} bgString Hex, rgba, or CSS Gradient string
 * @param {boolean} stripHash Whether to remove the '#' from hex results
 * @returns {string} Safe hex or rgba shadow base color
 */
export const extractBaseShadowColor = (bgString, stripHash = false) => {
  if (!bgString) return stripHash ? '000000' : '#000000';

  let result = '#000000';

  // If it's a solid hex, just use it
  if (bgString.startsWith('#')) {
    result = bgString.slice(0, 7);
  } else {
    // If it's a gradient, try to extract the first hex or rgba
    const hexMatch = bgString.match(/#[0-9A-Fa-f]{6}/);
    if (hexMatch) {
      result = hexMatch[0];
    } else {
      const rgbaMatch = bgString.match(/rgba?\([^)]+\)/);
      if (rgbaMatch) {
        result = rgbaMatch[0];
      }
    }
  }

  if (stripHash && result.startsWith('#')) {
    return result.slice(1);
  }

  return result;
};

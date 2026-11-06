/**
 * Formatting Utility Functions
 *
 * Shared formatters for bytes, durations, timestamps, and date labels.
 * Uses Intl API for locale-aware date/time formatting.
 */

// ─── Private Helpers ────────────────────────────────────────────────

/**
 * Safely create a Date object with null-safety
 * @param {string|number|Date} date
 * @returns {Date|null}
 */
const toDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Capitalize first letter of a string
 * @param {string} str
 * @returns {string}
 */
const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// ─── Data Formatters ────────────────────────────────────────────────

/**
 * Format bytes to human-readable string (e.g. "1.5 MB")
 * @param {number} bytes
 * @param {number} decimals
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format seconds to duration display string
 * - Under 1 hour: "m:ss" (e.g. "3:05")
 * - 1 hour or more: "h:mm:ss" (e.g. "1:03:05")
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds) || seconds < 0) return '0:00';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── Date/Time Formatters ───────────────────────────────────────────

/**
 * Format timestamp to localized HH:MM string
 * @param {string|number|Date} timestamp
 * @returns {string}
 */
export function formatTime(timestamp) {
  const d = toDate(timestamp);
  if (!d) return '-';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format date to relative or absolute label
 * "Today", "Yesterday", weekday name, or full date (locale-aware)
 * @param {string|number|Date} dateString
 * @returns {string}
 */
export function formatDateLabel(dateString) {
  const date = toDate(dateString);
  if (!date) return '';

  const now = new Date();
  const d = new Date(date).setHours(0, 0, 0, 0);
  const n = new Date(now).setHours(0, 0, 0, 0);
  const diffDays = Math.round((n - d) / (1000 * 60 * 60 * 24));

  // "Today" / "Yesterday" via Intl RTF
  if (diffDays >= 0 && diffDays <= 1) {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    return capitalize(rtf.format(-diffDays, 'day'));
  }

  // Within last week: weekday name
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }

  // Older: full date
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

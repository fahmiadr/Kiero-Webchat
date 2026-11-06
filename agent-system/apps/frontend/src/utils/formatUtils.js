/**
 * Formatting Utility Functions
 *
 * Shared formatters for bytes, durations, timestamps, and date labels.
 * Uses Intl API for locale-aware date/time formatting.
 */

/**
 * Helper to safely create a Date object
 * @param {string|Date} date 
 * @returns {Date|null}
 */
const toDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Helper to capitalize first letter of a string
 * @param {string} string 
 * @returns {string}
 */
const capitalize = (string) => {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
};

/**
 * Formats a date object to time string
 * Uses system locale default for time format (usually 12h or 24h based on OS)
 * 
 * @param {string|Date} date
 * @returns {string} e.g. "10:30 AM" or "10:30"
 */
export const formatTime = (date) => {
    const d = toDate(date);
    if (!d) return '-';
    // Passing undefined uses default locale
    return d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Formats a date object to time string with seconds
 * 
 * @param {string|Date} date
 * @returns {string} e.g. "10:30:45 AM" or "10:30:45"
 */
export const formatTimeWithSeconds = (date) => {
    const d = toDate(date);
    if (!d) return '-';
    return d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
};

/**
 * Formats a date for date separators/headers or relative labels
 * Logic: "Today" (Intl), "Yesterday" (Intl), "Weekday", or "Full Date"
 * 
 * @param {string|Date} dateString 
 * @returns {string} e.g. "Today", "Yesterday", "Monday", "January 1, 2024"
 */
export const formatDateLabel = (dateString) => {
    const date = toDate(dateString);
    if (!date) return '-';

    const now = new Date();
    // Reset hours to start of day for accurate day-diff calculation
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diffTime = today - target;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // 1. "Today" & "Yesterday" (0-1 days ago) via Intl
    if (diffDays >= 0 && diffDays <= 1) {
        // numeric: 'auto' -> "today"/"yesterday" (localized)
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        // Capitalize consistent with UI labels (e.g. "Today" vs "today")
        return capitalize(rtf.format(-diffDays, 'day'));
    }

    // Within last week: Show Weekday (e.g. "Monday")
    if (diffDays < 7 && diffDays > 1) {
        return date.toLocaleDateString(undefined, { weekday: 'long' });
    }

    // Older: Show Date (e.g. "January 1, 2023" or local equivalent)
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

/**
 * Formats a date/time string to human-readable chat format
 * Logic: "[Date Label], [Time]"
 * Reuses formatDateLabel for consistency.
 * 
 * @param {string|Date} timeString
 * @returns {string} 
 */
export const formatChatTime = (timeString) => {
    const date = toDate(timeString);
    if (!date) return '-';

    const label = formatDateLabel(date);
    const time = formatTime(date);

    return `${label}, ${time}`;
};

/**
 * Formats a date object to a standard full date string with time
 * 
 * @param {string|Date} date 
 * @returns {string} e.g. "1/1/2023, 12:00 PM"
 */
export const formatDateTime = (date) => {
    const d = toDate(date);
    if (!d) return '-';
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

/**
 * Formats a date object to full date/time with seconds
 * 
 * @param {string|Date} date 
 * @returns {string}
 */
export const formatDateTimeFull = (date) => {
    const d = toDate(date);
    if (!d) return '-';
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
};

/**
 * Formats a timestamp for log rows (short format preferred)
 * 
 * @param {string|Date} date 
 * @returns {string} e.g. "Jan 1, 10:30:45 AM"
 */
export const formatLogTimestamp = (date) => {
    const d = toDate(date);
    if (!d) return '-';

    // Using standard locale string which usually provides "MMM D, HH:mm:ss" or similar
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
};

/**
 * Formats just the date part
 * 
 * @param {string|Date} date 
 * @returns {string} e.g. "Jan 1, 2023"
 */
export const formatDate = (date) => {
    const d = toDate(date);
    if (!d) return '-';
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

/**
 * Get current time formatted
 * 
 * @returns {string}
 */
export const getCurrentTime = () => {
    return formatTimeWithSeconds(new Date());
};

/**
 * Data Formatting Utilities
 */

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

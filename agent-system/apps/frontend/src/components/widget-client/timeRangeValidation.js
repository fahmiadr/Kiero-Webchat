/**
 * Time Range Validation Utilities
 *
 * Pure functions for validating time range slots.
 * Used by both OperatingHoursTab and HolidaysTab (via shared TimeRangeSlot).
 */

/**
 * Checks if a time range is invalid (start >= end).
 *
 * @param {string} start - "HH:MM"
 * @param {string} end   - "HH:MM"
 * @returns {boolean} true if the range is invalid
 */
export function isInvalidRange(start, end) {
    if (!start || !end) return false; // incomplete — don't flag yet
    return start >= end;
}

/**
 * Checks if the range at `currentIndex` overlaps with any other range in the array.
 *
 * Two ranges [aStart, aEnd) and [bStart, bEnd) overlap when:
 *   aStart < bEnd AND bStart < aEnd
 *
 * @param {Array<{start: string, end: string}>} ranges - All ranges for the day
 * @param {number} currentIndex - Index of the range being checked
 * @returns {boolean} true if this range overlaps with at least one other
 */
export function hasOverlap(ranges, currentIndex) {
    const current = ranges[currentIndex];
    if (!current?.start || !current?.end) return false;
    if (isInvalidRange(current.start, current.end)) return false; // invalid range — separate error

    for (let i = 0; i < ranges.length; i++) {
        if (i === currentIndex) continue;
        const other = ranges[i];
        if (!other?.start || !other?.end) continue;
        if (isInvalidRange(other.start, other.end)) continue; // skip invalid ranges

        // Overlap check: A.start < B.end AND B.start < A.end
        if (current.start < other.end && other.start < current.end) {
            return true;
        }
    }
    return false;
}

/**
 * Validates all ranges in a day and returns an array of error strings (one per range).
 * Empty string = valid. Used by Zod refinements.
 *
 * @param {Array<{start: string, end: string}>} ranges
 * @returns {string[]} array of error messages, one per range
 */
export function validateRanges(ranges) {
    if (!ranges || ranges.length === 0) return [];
    return ranges.map((range, i) => {
        if (isInvalidRange(range.start, range.end)) {
            return 'End time must be after start time';
        }
        if (hasOverlap(ranges, i)) {
            return 'This slot overlaps with another slot';
        }
        return '';
    });
}

/**
 * Returns true if any range in the array has a validation error.
 * Convenience function for Zod superRefine.
 *
 * @param {Array<{start: string, end: string}>} ranges
 * @returns {boolean}
 */
export function hasAnyRangeError(ranges) {
    if (!ranges || ranges.length === 0) return false;
    return validateRanges(ranges).some(Boolean);
}

/**
 * Logic for creating the next default slot.
 * If prev slot ends at 17:00, next starts at 17:00 and ends at 18:00 (or 23:59 max).
 *
 * @param {Array<{start: string, end: string}>} ranges
 * @returns {{start: string, end: string}}
 */
export function getNextSlot(ranges) {
    const lastRange = ranges?.[ranges.length - 1];
    if (!lastRange) {
        return { start: '08:00', end: '17:00' };
    }

    const start = lastRange.end;
    // Simple hour addition (HH:MM -> HH+1:MM)
    let [h, m] = start.split(':').map(Number);
    h = Math.min(23, h + 4);
    const end = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    return { start, end: start === '23:59' ? '23:59' : end };
}

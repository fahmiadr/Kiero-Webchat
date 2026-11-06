/**
 * Operating Hours Time Helper
 *
 * Evaluates whether a business is currently open, closed, or on holiday
 * using the client's configured timezone via native Intl API.
 * Provides template variable interpolation for admin-configured messages.
 *
 * No external dependencies required.
 */

import { botConfig } from '../config/botConfig.js';

const DAYS_MAP = {
    0: 'Minggu',
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu',
};

// ─── Timezone Helpers (Native Intl API) ──────────────────────────

/**
 * Get date/time components in a specific timezone using native Intl API.
 *
 * @param {Date} date - JS Date object
 * @param {string} timezone - IANA timezone string (e.g. 'Asia/Jakarta')
 * @returns {{ dayOfWeek: number, dateStr: string, timeStr: string }}
 */
function getZonedParts(date, timezone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const parts = {};
    for (const { type, value } of formatter.formatToParts(date)) {
        parts[type] = value;
    }

    const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
    const hourStr = parts.hour === '24' ? '00' : parts.hour;
    const timeStr = `${hourStr.padStart(2, '0')}:${parts.minute.padStart(2, '0')}`;

    const dowFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
    });
    const dowStr = dowFormatter.format(date);
    const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dowMap[dowStr] ?? 0;

    return { dayOfWeek, dateStr, timeStr };
}

// ─── Core Status Check ───────────────────────────────────────────

/**
 * Normalizes a date value (string or Date object) into a strictly 'YYYY-MM-DD' string.
 */
function normalizeDateString(dateVal) {
    if (!dateVal) return null;
    if (dateVal instanceof Date) {
        // Prevent crashes on invalid dates
        if (isNaN(dateVal)) return null;
        return dateVal.toISOString().split('T')[0];
    }
    if (typeof dateVal === 'string') {
        return dateVal.split('T')[0];
    }
    return String(dateVal);
}

/**
 * Helper to gather names of consecutive closed holidays.
 */
function getConsecutiveHolidaysReason(holidays, startDateStr) {
    const closedHolidays = holidays.filter((h) => h.allDay !== false || !h.hours || h.hours.length === 0);
    const holidayMap = new Map();
    for (const h of closedHolidays) {
        const d = normalizeDateString(h.date);
        if (d) holidayMap.set(d, h);
    }

    if (!holidayMap.has(startDateStr)) return 'HOLIDAY';

    const consecutiveNames = [];
    let checkDateStr = startDateStr;

    while (holidayMap.has(checkDateStr)) {
        const h = holidayMap.get(checkDateStr);
        if (h.name && h.name.trim()) {
            const trimmedName = h.name.trim();
            if (consecutiveNames[consecutiveNames.length - 1] !== trimmedName) {
                consecutiveNames.push(trimmedName);
            }
        }

        // Increment day reliably (UTC string to avoid timezone drift)
        const d = new Date(checkDateStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        checkDateStr = d.toISOString().split('T')[0];
    }

    if (consecutiveNames.length > 0) {
        return `Holiday: ${consecutiveNames.join(', ')}`;
    }
    return 'HOLIDAY';
}

/**
 * Checks the operating status of a business based on its botConfig.
 *
 * Priority:
 *   1. Holiday (allDay=true → closed, allDay=false → use holiday hours)
 *   2. No schedule configured → 24/7
 *   3. Weekly operating hours
 *
 * @param {Object} botConfig - The widget client's bot configuration
 * @param {Date} [now] - Optional time override (for testing)
 * @returns {{ isOpen: boolean, isHoliday: boolean, reason: string, customMessage: string|null, nextOpening: Object|null, todayRanges: Array }}
 */
export function checkOperatingStatus(clientBotConfig = {}, now = new Date()) {
    const timezone = clientBotConfig.timezone || botConfig.timezone;
    const operatingHours = clientBotConfig.operatingHours || {};
    const holidays = clientBotConfig.holidays || [];

    const { dateStr: currentDateStr, timeStr: currentTimeStr, dayOfWeek: currentDay } =
        getZonedParts(now, timezone);

    // 1. Holiday check (highest priority)
    const holidayMatch = holidays.find((h) => normalizeDateString(h.date) === currentDateStr);

    if (holidayMatch) {
        const isAllDay = holidayMatch.allDay !== false; // default true for backward compat

        if (isAllDay) {
            // Full-day closure
            return {
                isOpen: false,
                isHoliday: true,
                reason: getConsecutiveHolidaysReason(holidays, currentDateStr),
                customMessage: holidayMatch.message || null,
                nextOpening: getNextOpeningTime(now, timezone, clientBotConfig, holidays),
                todayRanges: [],
            };
        }

        // Partial holiday — use holiday-specific hours
        const holidayRanges = holidayMatch.hours || [];
        if (holidayRanges.length === 0) {
            // No hours defined on a non-allDay holiday = treat as fully closed
            return {
                isOpen: false,
                isHoliday: true,
                reason: getConsecutiveHolidaysReason(holidays, currentDateStr),
                customMessage: holidayMatch.message || null,
                nextOpening: getNextOpeningTime(now, timezone, clientBotConfig, holidays),
                todayRanges: [],
            };
        }

        const isOpenNow = holidayRanges.some(
            (r) => currentTimeStr >= r.start && currentTimeStr <= r.end
        );

        if (isOpenNow) {
            return {
                isOpen: true,
                isHoliday: true,
                reason: 'OPEN',
                customMessage: null,
                nextOpening: null,
                todayRanges: holidayRanges,
            };
        }

        return {
            isOpen: false,
            isHoliday: true,
            reason: holidayMatch.name ? `Holiday: ${holidayMatch.name.trim()}` : 'HOLIDAY',
            customMessage: holidayMatch.message || null,
            nextOpening: findNextSlotOnDay(holidayRanges, currentTimeStr, currentDateStr, currentDay, now, timezone)
                || getNextOpeningTime(now, timezone, clientBotConfig, holidays),
            todayRanges: holidayRanges,
        };
    }

    // 2. Global Enable Toggle & Presence Check
    const isEnabled = clientBotConfig.isOperatingHoursEnabled !== false;
    const hasAnySchedule = Object.keys(operatingHours).length > 0;

    if (!isEnabled || !hasAnySchedule) {
        return {
            isOpen: true,
            isHoliday: false,
            reason: 'OPEN',
            customMessage: null,
            nextOpening: null,
            todayRanges: [{ start: '00:00', end: '23:59' }],
        };
    }

    // 3. Weekly schedule
    const dayConfig = operatingHours[String(currentDay)];
    // Support both legacy [ranges] and new { active: boolean, slots: [] }
    const isDayEnabled = dayConfig && (Array.isArray(dayConfig) ? dayConfig.length > 0 : dayConfig.active !== false);
    const todaysRanges = (dayConfig && !Array.isArray(dayConfig)) ? (dayConfig.slots || []) : (dayConfig || []);

    if (!isDayEnabled || todaysRanges.length === 0) {
        return {
            isOpen: false,
            isHoliday: false,
            reason: `Outside operating hours (${DAYS_MAP[currentDay]})`,
            customMessage: null,
            nextOpening: getNextOpeningTime(now, timezone, clientBotConfig, holidays),
            todayRanges: [],
        };
    }

    const isOpenNow = todaysRanges.some(
        (r) => currentTimeStr >= r.start && currentTimeStr <= r.end
    );

    if (isOpenNow) {
        return {
            isOpen: true,
            isHoliday: false,
            reason: 'OPEN',
            customMessage: null,
            nextOpening: null,
            todayRanges: todaysRanges,
        };
    }

    // Outside today's ranges — find next slot today or upcoming days
    const nextSlotToday = findNextSlotOnDay(todaysRanges, currentTimeStr, currentDateStr, currentDay, now, timezone);

    return {
        isOpen: false,
        isHoliday: false,
        reason: `Outside operating hours (${DAYS_MAP[currentDay]})`,
        customMessage: null,
        nextOpening: nextSlotToday || getNextOpeningTime(now, timezone, clientBotConfig, holidays),
        todayRanges: todaysRanges,
    };
}

// ─── Next Opening Finders ────────────────────────────────────────

/**
 * Checks if there is a later slot today that hasn't started yet.
 */
function findNextSlotOnDay(ranges, currentTimeStr, dateStr, dayIndex, now, timezone) {
    const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].start > currentTimeStr) {
            // Pass all remaining slots from this point onward
            return buildNextOpeningResult(dateStr, dayIndex, sorted.slice(i), now, timezone);
        }
    }
    return null;
}

/**
 * Scans up to 14 days ahead to find the next opening.
 * Handles holidays (allDay=true skipped, allDay=false uses holiday hours).
 */
export function getNextOpeningTime(now, timezone, clientBotConfig, holidays) {
    const operatingHours = clientBotConfig.operatingHours || {};
    const isEnabled = clientBotConfig.isOperatingHoursEnabled !== false;
    // Don't return null if disabled, because we might be in a holiday and need to find the next 24/7 day
    if (isEnabled && Object.keys(operatingHours).length === 0) return null;

    const holidayMap = new Map();
    holidays.forEach((h) => {
        const d = normalizeDateString(h.date);
        if (d) holidayMap.set(d, h);
    });

    // Create base date exactly at noon UTC by extracting the target timezone's local date components.
    // This prevents any bugs caused by adding 24h near a Daylight Saving Time boundary.
    const { dateStr: currentLocalStr } = getZonedParts(now, timezone);
    const [y, m, d] = currentLocalStr.split('-').map(Number);
    const baseDateUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

    for (let offset = 1; offset <= 14; offset++) {
        const checkDate = new Date(baseDateUTC.getTime() + offset * 86_400_000);
        const checkDateStr = checkDate.toISOString().split('T')[0]; // Safe YYYY-MM-DD
        const checkDay = checkDate.getUTCDay();

        const holiday = holidayMap.get(checkDateStr);

        if (holiday) {
            const isAllDay = holiday.allDay !== false;
            // If it's a full-day holiday, there are no opening hours for it, so we simply continue checking the next day
            if (isAllDay) continue;

            // Partial holiday — check if it has opening hours
            const hRanges = holiday.hours || [];
            if (hRanges.length > 0) {
                const sorted = [...hRanges].sort((a, b) => a.start.localeCompare(b.start));
                return buildNextOpeningResult(checkDateStr, checkDay, sorted, now, timezone);
            }
            continue;
        }

        // If isEnabled is false (24/7 mode), the first non-holiday day is open 24/7
        if (!isEnabled) {
            return buildNextOpeningResult(checkDateStr, checkDay, [{ start: '00:00', end: '23:59' }], now, timezone);
        }

        const dayConfig = operatingHours[String(checkDay)];
        const isDayEnabled = dayConfig && (Array.isArray(dayConfig) ? dayConfig.length > 0 : dayConfig.active !== false);
        const ranges = (dayConfig && !Array.isArray(dayConfig)) ? (dayConfig.slots || []) : (dayConfig || []);

        if (!isDayEnabled || ranges.length === 0) continue;

        const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
        return buildNextOpeningResult(checkDateStr, checkDay, sorted, now, timezone);
    }

    return null;
}

/**
 * Builds a next-opening result with relative labels (hari ini / besok / hari X).
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} dayIndex - 0-6 (Sunday-Saturday)
 * @param {Array<{start: string, end: string}>} allRanges - Sorted time ranges for the target day
 * @param {Date} now
 * @param {string} timezone
 */
function buildNextOpeningResult(dateStr, dayIndex, allRanges, now, timezone) {
    const dayName = DAYS_MAP[dayIndex];
    const todayParts = getZonedParts(now, timezone);
    const tomorrowParts = getZonedParts(new Date(now.getTime() + 86_400_000), timezone);

    const timeRangeStr = allRanges.map((r) => `${r.start} - ${r.end}`).join(', ');

    let label;
    if (dateStr === todayParts.dateStr) {
        label = `hari ini jam ${timeRangeStr}`;
    } else if (dateStr === tomorrowParts.dateStr) {
        label = `besok (${dayName}) jam ${timeRangeStr}`;
    } else {
        label = `hari ${dayName} (${dateStr}) jam ${timeRangeStr}`;
    }

    return { dayName, timeStr: timeRangeStr, dateStr, formattedString: label };
}

// ─── Template Interpolation ──────────────────────────────────────

/**
 * Builds a context object with all available template variables.
 *
 * @param {Object} status - Output from checkOperatingStatus
 * @param {Object} botConfig - Full bot config
 * @param {Date} [now] - Optional time override
 * @returns {Object} key-value map of template variables
 */
export function buildTemplateContext(status, clientBotConfig = {}, now = new Date()) {
    const timezone = clientBotConfig.timezone || botConfig.timezone;
    const { dayOfWeek, dateStr, timeStr } = getZonedParts(now, timezone);

    const todayScheduleStr = status.todayRanges.length > 0
        ? status.todayRanges.map((r) => `${r.start} - ${r.end}`).join(', ')
        : 'Tutup';

    return {
        hari: DAYS_MAP[dayOfWeek],
        tanggal: dateStr,
        jam: timeStr,
        buka_berikutnya: status.nextOpening?.formattedString || '-',
        buka_hari: status.nextOpening?.dayName || '-',
        buka_jam: status.nextOpening?.timeStr || '-',
        buka_tanggal: status.nextOpening?.dateStr || '-',
        jadwal_hari_ini: todayScheduleStr,
    };
}

/**
 * Interpolates template variables in a message string.
 * Replaces `{{variable}}` placeholders with actual values.
 *
 * @param {string} template - Message with {{placeholders}}
 * @param {Object} context - Variable map from buildTemplateContext
 * @returns {string} Interpolated message
 */
export function interpolateMessage(template, context) {
    if (!template) return '';
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return key in context ? context[key] : match;
    });
}

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Resolves the final welcome message based on operating status and botConfig.
 *
 * Decision tree:
 *   OPEN → standard welcomeMessage
 *   HOLIDAY with custom message → interpolate(holidayMessage) 
 *   HOLIDAY without custom message → interpolate(closedMessage or system default)
 *   CLOSED → interpolate(closedMessage or system default)
 *
 * @param {Object} botConfig - Full bot config from WidgetClient
 * @param {string} defaultWelcome - Fallback welcome message from global botConfig
 * @param {Date} [now] - Optional time override
 * @returns {{ message: string, isOpen: boolean, reason: string }}
 */
export function resolveWelcomeMessage(clientBotConfig = {}, defaultWelcome, now = new Date()) {
    const status = checkOperatingStatus(clientBotConfig, now);

    if (status.isOpen) {
        return {
            message: clientBotConfig.welcomeMessage || defaultWelcome,
            isOpen: true,
            reason: 'OPEN',
        };
    }

    const context = buildTemplateContext(status, clientBotConfig, now);

    // Holiday with custom holiday message
    if (status.isHoliday && status.customMessage) {
        return {
            message: interpolateMessage(status.customMessage, context),
            isOpen: false,
            reason: status.reason,
        };
    }

    // Closed or holiday without custom message: use closedMessage or system default
    const template = clientBotConfig.closedMessage
        || (status.isHoliday ? botConfig.holidayMessage : botConfig.closedMessage);

    return {
        message: interpolateMessage(template, context),
        isOpen: false,
        reason: status.reason,
    };
}

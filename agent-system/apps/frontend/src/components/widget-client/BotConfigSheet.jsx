import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import widgetClientService from '@/services/widgetClientService';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from '@/components/ui/sheet';
import {
    Form,
    FormControl
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Bot, Loader2, Clock, CalendarOff, MessageSquare, Eye, Timer, Check, ChevronsUpDown, Search } from "lucide-react";
import { Input, ChipInput } from '@/components/ui/input';
import { Debouncer } from "@tanstack/pacer";
import { useVirtualizer } from '@tanstack/react-virtual';

import { useForm, useWatch, useFormState, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { cn } from "@/lib/utils";
import OperatingHoursTab from './OperatingHoursTab';
import HolidaysTab from './HolidaysTab';
import LexicalTextarea from './lexical/LexicalTextarea';
import { hasAnyRangeError } from './timeRangeValidation';
import { SmartFormItem } from '@/components/ui/form';


/**
 * DebouncedFormTextarea
 *
 * Wraps LexicalTextarea with debounced form.setValue to avoid triggering
 * validation on every keystroke. LexicalTextarea calls onChange(string)
 * directly (not an event object).
 */
const DebouncedFormTextarea = memo(({ name, id, placeholder, className, ...props }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name });
    const debouncerRef = useRef(null);

    useEffect(() => {
        debouncerRef.current = new Debouncer(
            (val) => {
                setValue(name, val, {
                    shouldDirty: true,
                    shouldValidate: true,
                    shouldTouch: true
                });
            },
            { wait: 500 }
        );
        return () => { debouncerRef.current?.cancel(); };
    }, [name, setValue]);

    // LexicalTextarea calls onChange(string) — not an event
    const handleChange = useCallback((val) => {
        debouncerRef.current?.maybeExecute(val);
    }, []);

    return (
        <LexicalTextarea
            {...props}
            id={id}
            value={watchedValue || ''}
            onChange={handleChange}
            placeholder={placeholder}
            className={className}
        />
    );
});
DebouncedFormTextarea.displayName = 'DebouncedFormTextarea';

const DebouncedFormInput = memo(({ name, type = "text", ...props }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name });
    const [localValue, setLocalValue] = useState(watchedValue || "");
    const debouncerRef = useRef(null);
    const { suffix, ...inputProps } = props;

    // Sync with form resets or external changes
    useEffect(() => {
        if (watchedValue !== localValue) {
            setLocalValue(watchedValue);
        }
    }, [watchedValue]);

    useEffect(() => {
        debouncerRef.current = new Debouncer(
            (val) => {
                setValue(name, val, {
                    shouldDirty: true,
                    shouldValidate: true,
                    shouldTouch: true
                });
            },
            { wait: 500 }
        );

        return () => {
            debouncerRef.current?.cancel();
        };
    }, [name, setValue, type]);

    const handleChange = (e) => {
        const val = e.target.value;
        setLocalValue(val);
        debouncerRef.current?.maybeExecute(val);
    };

    return (
        <Input
            {...inputProps}
            type={type}
            value={localValue}
            onChange={handleChange}
            suffix={suffix}
            font={suffix ? "mono" : undefined}
            className={inputProps.className}
        />
    );
});
DebouncedFormInput.displayName = 'DebouncedFormInput';

const TimezoneSelector = memo(({ name, id, 'aria-invalid': ariaInvalid }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name });
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [listRef, setListRef] = useState(null);
    const [hoveredValue, setHoveredValue] = useState(null);

    const filteredOptions = React.useMemo(() => {
        if (!search) return TIMEZONE_OPTIONS;
        const lowerSearch = search.toLowerCase();
        return TIMEZONE_OPTIONS.filter(o =>
            o.label.toLowerCase().includes(lowerSearch) ||
            o.value.toLowerCase().includes(lowerSearch)
        );
    }, [search]);

    const virtualizer = useVirtualizer({
        count: filteredOptions.length,
        getScrollElement: () => listRef,
        estimateSize: () => 36,
        overscan: 5,
    });

    useEffect(() => {
        if (open) {
            setHoveredValue(watchedValue);
        }
        if (open && listRef) {
            const index = filteredOptions.findIndex(o => o.value === watchedValue);
            if (index !== -1) {
                requestAnimationFrame(() => {
                    virtualizer.scrollToIndex(index, { align: 'center' });
                });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, listRef]);

    const activeOption = React.useMemo(() => {
        return TIMEZONE_OPTIONS.find(o => o.value === watchedValue);
    }, [watchedValue]);

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <FormControl>
                    <button
                        id={id}
                        type="button"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "group text-slate-200 flex h-10 w-full items-center justify-between rounded-md border-2 border-slate-600 bg-slate-700/40 px-3 py-2 text-sm cursor-pointer select-none mt-1 transition-colors outline-none",
                            "ring-offset-slate-950 placeholder:text-slate-500 text-left font-normal",
                            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            "hover:border-slate-500 hover:bg-slate-700/60",
                            "[&>span]:line-clamp-1",
                            !watchedValue && "text-slate-400",
                            ariaInvalid && "border-destructive text-destructive focus:ring-destructive focus-visible:ring-destructive hover:border-destructive"
                        )}
                    >
                        <span className="truncate flex items-center">
                            {activeOption ? (
                                <>
                                    <span>{activeOption.label}</span>
                                    <span className="text-slate-500 ml-2">({activeOption.offset})</span>
                                </>
                            ) : (
                                "Select timezone"
                            )}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </button>
                </FormControl>
            </PopoverTrigger>
            <PopoverContent
                className="p-0 bg-slate-900 border-slate-700 shadow-md"
                align="start"
                style={{ width: "var(--radix-popover-trigger-width)" }}
            >
                <div className="flex items-center border-b border-slate-700 px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-slate-400" />
                    <input
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-slate-500 text-white disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Search timezone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div
                    ref={setListRef}
                    onMouseLeave={() => setHoveredValue(null)}
                    onWheelCapture={(e) => e.stopPropagation()}
                    onTouchMoveCapture={(e) => e.stopPropagation()}
                    className="max-h-96 overflow-auto py-1 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-thumb:hover]:cursor-default [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-transparent"
                >
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {virtualizer.getVirtualItems().map((virtualItem) => {
                            const opt = filteredOptions[virtualItem.index];
                            if (!opt) return null;
                            const isSelected = watchedValue === opt.value;
                            const isHovered = hoveredValue === opt.value;
                            return (
                                <div
                                    key={virtualItem.key}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 4,
                                        width: 'calc(100% - 8px)',
                                        height: `${virtualItem.size}px`,
                                        transform: `translateY(${virtualItem.start}px)`,
                                    }}
                                    className={cn(
                                        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
                                        isHovered ? "bg-slate-700/60 text-slate-100" : "text-slate-200"
                                    )}
                                    onMouseEnter={() => setHoveredValue(opt.value)}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                    }}
                                    onClick={() => {
                                        setValue(name, opt.value, { shouldDirty: true, shouldValidate: true });
                                        setOpen(false);
                                        setSearch(''); // Auto reset search on selection
                                    }}
                                >
                                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                        {isSelected && <Check className="h-4 w-4" />}
                                    </span>
                                    <span>{opt.label}</span>
                                    <span className="text-slate-500 ml-2">({opt.offset})</span>
                                </div>
                            );
                        })}
                    </div>
                    {filteredOptions.length === 0 && (
                        <div className="py-6 text-center text-sm text-slate-500">
                            No timezone found.
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
});
TimezoneSelector.displayName = 'TimezoneSelector';

const KeywordSelector = memo(({ name }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name }) || [];
    return (
        <ChipInput
            value={watchedValue}
            onChange={(val) => setValue(name, val, { shouldDirty: true, shouldValidate: true })}
            placeholder="Default: agent, support, bantuan, agen, agents, cs, admin"
            variant="emerald"
            lowercase
            containerClassName="mt-1"
        />
    );
});
KeywordSelector.displayName = 'KeywordSelector';

// ─── Constants ────────────────────────────────────────────────────

// Cache for Intl.DateTimeFormat instances to avoid expensive re-creation
const dtfCache = new Map();
function getCachedDTF(locales, options) {
    const key = JSON.stringify({ locales, options });
    if (!dtfCache.has(key)) {
        dtfCache.set(key, new Intl.DateTimeFormat(locales, options));
    }
    return dtfCache.get(key);
}

/**
 * Computes the UTC offset string for a given IANA timezone.
 * Uses native Intl to stay accurate across DST changes.
 */
function getUtcOffset(tz) {
    if (!tz) return '';
    try {
        const now = new Date();
        const dtf = getCachedDTF('en-US', {
            timeZone: tz,
            timeZoneName: 'shortOffset',
        });
        const parts = dtf.formatToParts(now);
        const offsetPart = parts.find((p) => p.type === 'timeZoneName');
        if (offsetPart) {
            // "GMT+7" → "UTC+07:00"
            const raw = offsetPart.value.replace('GMT', 'UTC');
            const match = raw.match(/UTC([+-]?)(\d{1,2})(?::(\d{2}))?/);
            if (match) {
                const sign = match[1] || '+';
                const hours = match[2].padStart(2, '0');
                const minutes = match[3] || '00';
                return `UTC${sign}${hours}:${minutes}`;
            }
            return raw === 'UTC' ? 'UTC+00:00' : raw;
        }
    } catch { /* fallback */ }
    return '';
}

const TIMEZONE_LIST = (() => {
    try {
        // Native built-in ICU engine API (over 450+ global timezones, auto-updates for DST)
        return Intl.supportedValuesOf('timeZone');
    } catch {
        return [
            'Asia/Jakarta',
            'Asia/Makassar',
            'Asia/Jayapura',
            'Asia/Singapore',
            'Asia/Tokyo',
            'Asia/Bangkok',
            'Asia/Kolkata',
            'Asia/Dubai',
            'Europe/London',
            'Europe/Berlin',
            'America/New_York',
            'America/Chicago',
            'America/Los_Angeles',
            'Australia/Sydney',
            'Pacific/Auckland',
        ];
    }
})();

// Calculate once at module load (singleton global state).
// This statically caches the offset evaluations so React never calls Intl APIs during renders.
const TIMEZONE_OPTIONS = TIMEZONE_LIST.map((tz) => ({
    value: tz,
    label: tz,
    offset: getUtcOffset(tz),
}));



// ─── Schema ───────────────────────────────────────────────────────

const timeRangeSchema = z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
}).refine((range) => range.start < range.end, {
    message: 'End time must be after start time',
    path: ['end'],
});

const botConfigSchema = z.object({
    welcomeMessage: z.string()
        .min(5, 'Must be at least 5 characters')
        .nullable()
        .optional()
        .or(z.literal(''))
        .transform(v => (v === '' ? null : v)),
    requestAgentKeywords: z.array(z.string()).optional().default([]),
    isOperatingHoursEnabled: z.boolean().default(false),
    timezone: z.string().min(1, { message: 'Timezone is required.' }),
    operatingHours: z.preprocess((val) => {
        if (!val) return {};
        if (Array.isArray(val)) {
            const obj = {};
            val.forEach((dayRanges, index) => {
                obj[String(index)] = {
                    active: Array.isArray(dayRanges) && dayRanges.length > 0,
                    slots: Array.isArray(dayRanges) ? dayRanges : []
                };
            });
            return obj;
        }
        return val;
    }, z.record(z.string(), z.object({
        active: z.boolean(),
        slots: z.array(timeRangeSchema)
    }))).nullable().optional().default({})
        .superRefine((hours, ctx) => {
            if (!hours) return;
            for (const [dayKey, config] of Object.entries(hours)) {
                if (config.active && hasAnyRangeError(config.slots)) {
                    ctx.addIssue({
                        code: 'custom',
                        message: `Day ${dayKey} has invalid or overlapping time ranges`,
                        path: [dayKey]
                    });
                }
            }
        }),
    holidays: z.preprocess((val) => {
        if (!val) return [];
        if (!Array.isArray(val)) return [];
        return val;
    }, z.array(z.object({
        name: z.string().min(2, 'Must be at least 2 characters.').or(z.literal('')),
        date: z.string().min(1, 'Holiday date is required.'),
        allDay: z.boolean(),
        hours: z.array(timeRangeSchema).optional().default([])
            .superRefine((ranges, ctx) => {
                if (hasAnyRangeError(ranges)) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Holiday has invalid or overlapping time ranges',
                    });
                }
            }),
        message: z.string().min(5, 'Must be at least 5 characters.').or(z.literal('')),
    })).superRefine((holidays, ctx) => {
        const dates = holidays.map(h => h.date).filter(Boolean);
        const duplicates = dates.filter((date, index) => dates.indexOf(date) !== index);

        if (duplicates.length > 0) {
            ctx.addIssue({
                code: 'custom',
                message: `Duplicate holiday dates found: ${[...new Set(duplicates)].join(', ')}`,
                path: [], // Array level error
            });
        }
    })).nullable().optional().default([]),
    closedMessage: z.string()
        .min(5, 'Must be at least 5 characters')
        .nullable()
        .optional()
        .or(z.literal(''))
        .transform(v => (v === '' ? null : v)),
    sessionTtlHours: z.union([
        z.coerce.number().min(1, 'Must be at least 1 hour').max(168),
        z.literal('').transform(() => null),
        z.null()
    ]).optional(),
    agentWaitTimeoutMinutes: z.union([
        z.coerce.number().min(1, 'Must be at least 1 minute').max(1440),
        z.literal('').transform(() => null),
        z.null()
    ]).optional(),
    agentWaitTimeoutMessage: z.string()
        .min(5, 'Must be at least 5 characters')
        .nullable()
        .optional()
        .or(z.literal(''))
        .transform(v => (v === '' ? null : v)),
});

const RealBotPreview = memo(({ preview, loading, error, onFetch }) => {
    return (
        <div className="space-y-3">
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onFetch}
                disabled={loading}
                className="w-full h-8 text-[11px] bg-slate-700/40 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500 hover:text-white text-slate-200"
            >
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Generating Actual Preview...
                    </>
                ) : (
                    <>
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        Test Real Preview
                    </>
                )}
            </Button>

            {preview && (
                <div className="p-3 bg-slate-900/50 border-2 border-slate-800 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-start gap-2 mb-2">
                        <div className={cn(
                            "w-2 h-2 rounded-full mt-1 shrink-0",
                            preview.isOpen ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                        )} />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider break-words break-all shrink min-w-0">
                            Real Preview: {preview.isOpen ? 'OPEN' : `CLOSED (${preview.reason})`}
                        </span>
                    </div>
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 border border-slate-600">
                            <Bot className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="flex-1 space-y-1">
                            <p className="text-[11px] font-bold text-slate-400">{preview.isOpen ? 'Welcome Message' : 'Closed Message'}</p>
                            <div className="p-3 bg-slate-800 rounded-2xl rounded-tl-none border border-slate-700">
                                <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed break-words break-all">
                                    {preview.message}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-md text-[10px] text-red-300 animate-pulse">
                    ⚠️ Error: {error}
                </div>
            )}
        </div>
    );
});
RealBotPreview.displayName = 'RealBotPreview';

const BotConfigSubmitButton = memo(({ control, isSubmitting }) => {
    const { isDirty, isValid } = useFormState({ control });
    return (
        <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20"
            disabled={isSubmitting || !isDirty || !isValid}
        >
            {isSubmitting ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                </>
            ) : (
                'Save Configuration'
            )}
        </Button>
    );
});
BotConfigSubmitButton.displayName = 'BotConfigSubmitButton';

const SessionTimeoutSection = memo(() => (
    <div className="space-y-3 p-4 bg-transparent rounded-md border border-slate-600">
        <div className="flex items-center gap-2 text-blue-400 mb-3">
            <Timer className="w-4 h-4" />
            <span className="text-md font-bold uppercase tracking-wider">Session & Timeout</span>
        </div>

        {/* Session Duration */}
        <SmartFormItem
            name="sessionTtlHours"
            label="Session TTL"
            description="Session active time."
            InputComponent={DebouncedFormInput}
            inputProps={{
                type: "number",
                min: 1,
                max: 168,
                placeholder: "Default: 24 Hours",
                className: "mt-1",
                suffix: "hours"
            }}
        />

        {/* Agent Wait Timeout */}
        <SmartFormItem
            name="agentWaitTimeoutMinutes"
            label="Agent Wait Timeout"
            description="Close chat if no agent handles within this time."
            InputComponent={DebouncedFormInput}
            inputProps={{
                type: "number",
                min: 1,
                max: 1440,
                placeholder: "Default: 60 Minutes",
                className: "mt-1",
                suffix: "minutes"
            }}
        />

        <SmartFormItem
            name="agentWaitTimeoutMessage"
            label="Timeout Message"
            description="Sent when agent wait timeout is reached."
            InputComponent={DebouncedFormTextarea}
            inputProps={{
                placeholder: "Default: Mohon maaf, agent kami sedang tidak tersedia, mohon dihubungi beberapa saat kembali.",
                className: "mt-1 resize-none h-24"
            }}
        />
    </div>
));
SessionTimeoutSection.displayName = 'SessionTimeoutSection';

// ─── Main Component ──────────────────────────────────────────────

const BotConfigSheet = memo(({
    open,
    onOpenChange,
    client,
    onSubmit,
    isSubmitting,
}) => {
    const [activeTab, setActiveTab] = useState("general");
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);

    const form = useForm({
        resolver: zodResolver(botConfigSchema),
        defaultValues: {
            welcomeMessage: '',
            requestAgentKeywords: [],
            timezone: 'Asia/Jakarta',
            operatingHours: {},
            holidays: [],
            closedMessage: '',
            isOperatingHoursEnabled: false,
            sessionTtlHours: '',
            agentWaitTimeoutMinutes: '',
            agentWaitTimeoutMessage: '',
        },
    });

    // Reset form on open/client change
    useEffect(() => {
        if (open && client) {
            const bc = client.botConfig || {};
            form.reset({
                welcomeMessage: bc.welcomeMessage || '',
                requestAgentKeywords: Array.isArray(bc.requestAgentKeywords)
                    ? bc.requestAgentKeywords
                    : [],
                timezone: bc.timezone || 'Asia/Jakarta',
                isOperatingHoursEnabled: bc.isOperatingHoursEnabled ?? !!(bc.operatingHours && Object.keys(bc.operatingHours).length > 0),
                operatingHours: Object.fromEntries(
                    ['0', '1', '2', '3', '4', '5', '6'].map(day => {
                        const dayConfig = bc.operatingHours?.[day];
                        // Ensure each day is normalized to { active, slots } to match form state
                        const active = dayConfig
                            ? (Array.isArray(dayConfig) ? dayConfig.length > 0 : dayConfig.active !== false)
                            : false;
                        const slots = (dayConfig && !Array.isArray(dayConfig)) ? (dayConfig.slots || []) : (dayConfig || []);
                        return [day, { active, slots }];
                    })
                ),
                holidays: (Array.isArray(bc.holidays) ? bc.holidays : []).map(h => ({
                    // Deep normalization to ensure isDirty works correctly
                    name: h.name || '',
                    date: h.date || '',
                    allDay: h.allDay !== false,
                    hours: Array.isArray(h.hours) ? h.hours : [],
                    message: h.message || ''
                })),
                closedMessage: bc.closedMessage || '',
                sessionTtlHours: bc.sessionTtlSeconds ? Math.round(bc.sessionTtlSeconds / 3600) : '',
                agentWaitTimeoutMinutes: bc.agentWaitTimeoutMinutes || '',
                agentWaitTimeoutMessage: bc.agentWaitTimeoutMessage || '',
            });
            setActiveTab("general");
            setPreview(null);
            setPreviewLoading(false);
            setPreviewError(null);
        }
    }, [open, client?.id, form]);

    const handleFetchPreview = useCallback(async () => {
        if (!client?.id) return;
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            const botConfig = form.getValues();
            const data = await widgetClientService.previewBotConfig(client.id, botConfig);
            setPreview(data);
        } catch (err) {
            setPreviewError(err.response?.data?.error?.message || err.message || 'Failed to fetch preview');
        } finally {
            setPreviewLoading(false);
        }
    }, [client?.id, form]);

    const handleFormSubmit = (values) => {
        if (!client) return;

        const cleanHolidays = (values.holidays || [])
            .filter((h) => h.date)
            .map((h) => {
                const isAllDay = h.allDay !== false;
                return {
                    ...(h.name ? { name: h.name } : {}),
                    date: h.date,
                    allDay: isAllDay,
                    ...(isAllDay ? {} : { hours: h.hours || [] }),
                    ...(h.message ? { message: h.message } : {}),
                };
            });

        const sanitizedValues = {
            ...values,
            holidays: cleanHolidays,
            operatingHours: Object.fromEntries(
                Object.entries(values.operatingHours || {}).map(([day, config]) => [
                    day,
                    {
                        active: !!config.active,
                        slots: config.slots || []
                    }
                ])
            ),
            agentWaitTimeoutMinutes: values.agentWaitTimeoutMinutes === '' ? null : values.agentWaitTimeoutMinutes,
            sessionTtlSeconds: values.sessionTtlHours ? values.sessionTtlHours * 3600 : null,
            sessionTtlHours: undefined,
        };

        onSubmit(client.id, sanitizedValues);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="bg-slate-900 border-l border-slate-800 text-slate-100 sm:max-w-md overflow-y-auto w-full">
                <SheetHeader>
                    <SheetTitle className="text-white text-xl flex items-center gap-2">
                        <Bot className="w-5 h-5 text-blue-400" />
                        Bot Configuration
                    </SheetTitle>
                    <SheetDescription className="text-slate-400">
                        Configure bot settings for{' '}
                        <span className="text-white font-medium">{client?.name}</span>.
                    </SheetDescription>
                </SheetHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="mt-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="w-full">
                                <TabsTrigger value="general" className="flex-1">
                                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                                    General
                                </TabsTrigger>
                                <TabsTrigger value="hours" className="flex-1">
                                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                                    Hours
                                </TabsTrigger>
                                <TabsTrigger value="holidays" className="flex-1">
                                    <CalendarOff className="w-3.5 h-3.5 mr-1.5" />
                                    Holidays
                                </TabsTrigger>
                            </TabsList>

                            {/* ── General Tab ─────────────────────────── */}
                            <TabsContent value="general" className="space-y-3 mt-6">
                                {/* Timezone */}
                                <SmartFormItem
                                    name="timezone"
                                    label="Timezone"
                                    required
                                    description="Timezone used for operating hours calculation."
                                    InputComponent={TimezoneSelector}
                                />

                                {/* Welcome Message */}
                                <SmartFormItem
                                    name="welcomeMessage"
                                    label="Welcome Message"
                                    description="Sent when a chat starts (during open hours)."
                                    InputComponent={DebouncedFormTextarea}
                                    inputProps={{
                                        placeholder: "Default: Selamat datang di pusat bantuan kami. Untuk komunikasi langsung dengan agent, mohon ketik *agent*.",
                                        className: "mt-1 resize-none h-24"
                                    }}
                                />

                                <SmartFormItem
                                    name="closedMessage"
                                    label="Closed Message"
                                    description="Sent when a chat starts (during closed hours)."
                                    InputComponent={DebouncedFormTextarea}
                                    inputProps={{
                                        placeholder: "Default: Maaf, saat ini kami sedang tutup. Kami buka kembali {{buka_berikutnya}}.",
                                        className: "resize-none h-24 mt-1"
                                    }}
                                />

                                {/* Real-time Preview via Backend */}
                                <RealBotPreview
                                    preview={preview}
                                    loading={previewLoading}
                                    error={previewError}
                                    onFetch={handleFetchPreview}
                                />

                                {/* Keywords */}
                                <SmartFormItem
                                    name="requestAgentKeywords"
                                    label="Agent Request Keywords"
                                    description="Keywords that trigger agent handoff. Press Enter to add."
                                    InputComponent={KeywordSelector}
                                />

                                {/* Session & Timeout Section */}
                                <SessionTimeoutSection />
                            </TabsContent>

                            {/* ── Operating Hours Tab ───────────────── */}
                            <TabsContent value="hours" className="space-y-3 mt-6">
                                <OperatingHoursTab />
                            </TabsContent>

                            {/* ── Holidays Tab ─────────────────────── */}
                            <TabsContent value="holidays" className="space-y-3 mt-6">
                                <HolidaysTab />
                            </TabsContent>
                        </Tabs>

                        <SheetFooter className="mt-6">
                            <BotConfigSubmitButton control={form.control} isSubmitting={isSubmitting} />
                        </SheetFooter>
                    </form>
                </Form>
            </SheetContent>
        </Sheet>
    );
});

BotConfigSheet.displayName = 'BotConfigSheet';

export default BotConfigSheet;

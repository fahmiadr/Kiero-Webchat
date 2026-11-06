import React, { memo, useState, useRef, useCallback, useEffect } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─── Constants ───────────────────────────────────────────────────────────────

const CHECKERBOARD_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23555'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23555'/%3E%3Crect x='4' width='4' height='4' fill='%23333'/%3E%3Crect y='4' width='4' height='4' fill='%23333'/%3E%3C/svg%3E\")";

const GRADIENT_TYPES = [
    { value: 'linear', label: 'Linear' },
    { value: 'radial', label: 'Radial' },
    { value: 'conic', label: 'Conic' },
];


const SOLID_PRESETS = [
    '#FFFFFF', '#0F172A', '#3B82F6', '#8B5CF6',
    '#10B981', '#EF4444', '#F59E0B', '#EC4899',
];

const PICKER_STYLES = `
    .cpf-picker .react-colorful__saturation {
        height: 120px !important;
        border: 2px solid #334155 !important;
        border-radius: 8px !important;
        cursor: crosshair !important;
    }
    .cpf-picker .react-colorful__hue,
    .cpf-picker .react-colorful__alpha {
        height: 14px !important;
        border: 2px solid #334155 !important;
        border-radius: 10px !important;
        margin-top: 8px !important;
        cursor: pointer !important;
    }
    .cpf-picker .react-colorful__pointer {
        width: 14px !important;
        height: 14px !important;
        cursor: grab !important;
    }
    .cpf-picker .react-colorful {
        width: 100% !important;
        height: auto !important;
    }
    /* Stabilize cursor during drag */
    .cpf-picker.is-dragging,
    .cpf-picker.is-dragging * {
        cursor: grabbing !important;
    }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _stopIdCounter = 100;
const createStop = (offset, color) => ({ id: ++_stopIdCounter, offset, color });

const buildGradientCss = (config) => {
    const stops = [...config.stops].sort((a, b) => a.offset - b.offset);
    const stopStr = stops.map(s => `${s.color} ${s.offset}%`).join(', ');
    const { type, angle } = config;
    if (type === 'linear') return `linear-gradient(${angle}deg, ${stopStr})`;
    if (type === 'radial') return `radial-gradient(circle, ${stopStr})`;
    if (type === 'conic') return `conic-gradient(from ${angle}deg, ${stopStr})`;
    return stopStr;
};

/** Parse alpha from 8-digit hex. Returns 0-100 integer. */
const hexToAlpha = (hex = '') => {
    if (typeof hex !== 'string' || !hex.startsWith('#')) return 100;
    const h = hex.replace('#', '');
    if (h.length < 8) return 100;
    const dec = parseInt(h.slice(6, 8), 16);
    if (Number.isNaN(dec)) return 100;
    return Math.round((dec / 255) * 100);
};

const getCleanHex = (hex = '', limit = 8) => hex.replace('#', '').slice(0, limit).toUpperCase();

/** Parses a CSS linear-gradient string back into config */
const parseGradientString = (str) => {
    if (!str || !str.includes('gradient')) return null;
    try {
        const typeMatch = str.match(/^(linear|radial|conic)-gradient/);
        const type = typeMatch ? typeMatch[1] : 'linear';

        // Extract content inside parenthesis
        const contentMatch = str.match(/gradient\((.*)\)$/);
        if (!contentMatch) return null;

        const parts = contentMatch[1].split(/,(?![^(]*\))/).map(p => p.trim());
        let angle = 90;
        let stopsPart = parts;

        const dirMap = {
            'to top': 0, 'to bottom': 180, 'to left': 270, 'to right': 90,
            'to top right': 45, 'to bottom right': 135, 'to bottom left': 225, 'to top left': 315,
        };

        if (type === 'linear') {
            const first = parts[0].toLowerCase();
            if (first.includes('deg')) {
                angle = parseInt(first, 10) || 90;
                stopsPart = parts.slice(1);
            } else if (dirMap[first] !== undefined) {
                angle = dirMap[first];
                stopsPart = parts.slice(1);
            } else if (first.startsWith('to ')) {
                // Unknown but valid-looking direction string
                stopsPart = parts.slice(1);
            }
        } else if (type === 'conic' && parts[0].includes('from')) {
            const angleMatch = parts[0].match(/from\s+(\d+)deg/);
            angle = angleMatch ? parseInt(angleMatch[1], 10) : 0;
            stopsPart = parts.slice(1);
        } else if (type === 'radial' && (parts[0].startsWith('circle') || parts[0].startsWith('ellipse'))) {
            stopsPart = parts.slice(1);
        }

        const parsedStops = stopsPart.map((stopStr) => {
            const sParts = stopStr.trim().split(/\s+/);
            const color = sParts[0];
            const offsetStr = sParts[1];
            return {
                id: ++_stopIdCounter,
                color: color || '#FFFFFFFF',
                offset: offsetStr ? parseInt(offsetStr, 10) : null
            };
        });

        // Fill in missing offsets by distributing them evenly
        if (parsedStops.length >= 1) {
            if (parsedStops[0].offset === null) parsedStops[0].offset = 0;
            if (parsedStops[parsedStops.length - 1].offset === null) parsedStops[parsedStops.length - 1].offset = 100;

            for (let i = 1; i < parsedStops.length - 1; i++) {
                if (parsedStops[i].offset === null) {
                    let j = i + 1;
                    while (j < parsedStops.length - 1 && parsedStops[j].offset === null) j++;

                    const prevOffset = parsedStops[i - 1].offset;
                    const nextOffset = parsedStops[j].offset;
                    const itemsToFill = j - i + 1;
                    const step = (nextOffset - prevOffset) / itemsToFill;

                    for (let k = i; k < j; k++) {
                        parsedStops[k].offset = Math.round(prevOffset + step * (k - i + 1));
                    }
                    i = j - 1;
                }
            }
        }

        if (parsedStops.length < 2) return null;
        return { type, angle, stops: parsedStops, activeStopId: parsedStops[0].id };
    } catch (e) {
        return null;
    }
};

// ─── GradientStopBar ─────────────────────────────────────────────────────────

const GradientStopBar = memo(({ config, onConfigChange }) => {
    const barRef = useRef(null);
    const draggingRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    const gradientCss = buildGradientCss({ ...config, type: 'linear', angle: 90 });

    const getOffsetFromEvent = useCallback((e) => {
        const bar = barRef.current;
        if (!bar) return 0;
        const rect = bar.getBoundingClientRect();
        return Math.round(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
    }, []);

    // click on bar → add new stop at that position
    const handleBarClick = useCallback((e) => {
        if (draggingRef.current) return;
        const offset = getOffsetFromEvent(e);
        // don't add if clicking near an existing stop
        const isNearExisting = config.stops.some(s => Math.abs(s.offset - offset) < 4);
        if (isNearExisting) return;
        const sorted = [...config.stops].sort((a, b) => a.offset - b.offset);
        const newColor = sorted[0]?.color ?? '#FFFFFFFF';
        const newStop = createStop(offset, newColor);
        const newStops = [...config.stops, newStop];
        onConfigChange({ ...config, stops: newStops, activeStopId: newStop.id });
    }, [config, getOffsetFromEvent, onConfigChange]);

    // drag stop
    const handleStopMouseDown = useCallback((e, stopId) => {
        e.stopPropagation();
        e.preventDefault();
        setIsDragging(true);
        draggingRef.current = stopId;
        onConfigChange(prev => ({ ...prev, activeStopId: stopId }));

        const onMouseMove = (moveEvent) => {
            const offset = getOffsetFromEvent(moveEvent);
            onConfigChange(prev => ({
                ...prev,
                stops: prev.stops.map(s => s.id === stopId ? { ...s, offset } : s),
            }));
        };
        const onMouseUp = () => {
            setIsDragging(false);
            draggingRef.current = null;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [getOffsetFromEvent, onConfigChange]);

    const removeStop = useCallback((stopId) => {
        if (config.stops.length <= 2) return; // minimum 2 stops
        onConfigChange(prev => {
            const newStops = prev.stops.filter(s => s.id !== stopId);
            const newActive = newStops[0].id;
            return { ...prev, stops: newStops, activeStopId: newActive };
        });
    }, [config.stops.length, onConfigChange]);

    // Handle Backspace/Delete to remove active stop
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                // Don't delete if we are in an input field
                if (e.target.tagName === 'INPUT') return;
                removeStop(config.activeStopId);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [config.activeStopId, removeStop]);

    return (
        <div className="flex flex-col gap-2">
            {/* The bar */}
            <div
                ref={barRef}
                onClick={handleBarClick}
                className={cn(
                    "relative h-[14px] w-full rounded-[10px] border-2 border-slate-700 box-border transition-colors",
                    isDragging ? "cursor-grabbing" : "cursor-crosshair"
                )}
                style={{ background: CHECKERBOARD_BG }}
            >
                {/* gradient layer */}
                <div
                    className="absolute inset-0 rounded-[8px]"
                    style={{ background: gradientCss }}
                />
                {/* stop handles */}
                {config.stops.map((stop) => {
                    const isActive = stop.id === config.activeStopId;
                    return (
                        <div
                            key={stop.id}
                            onMouseDown={(e) => handleStopMouseDown(e, stop.id)}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg select-none transition-[box-shadow,transform] duration-100',
                                isDragging ? 'cursor-grabbing' : 'cursor-grab',
                                isActive
                                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-900 z-20 scale-110'
                                    : 'z-10 hover:scale-110'
                            )}
                            style={{ left: `${stop.offset}%`, backgroundColor: stop.color }}
                        />
                    );
                })}
            </div>
        </div>
    );
});
GradientStopBar.displayName = 'GradientStopBar';

// ─── AngleInput ───────────────────────────────────────────────────────────────

const AngleInput = memo(({ angle, onChange, disabled = false }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const wheelRef = useRef(null);

    const handleWheelMouseDown = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);

        const updateFromEvent = (moveEvent) => {
            if (!wheelRef.current) return;
            const rect = wheelRef.current.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const rad = Math.atan2(moveEvent.clientY - cy, moveEvent.clientX - cx);
            const deg = Math.round(((rad * 180) / Math.PI + 90 + 360) % 360);
            onChange(deg);
        };

        updateFromEvent(e);

        const onMouseMove = (moveEvent) => updateFromEvent(moveEvent);
        const onMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [onChange]);

    const normAngle = ((angle % 360) + 360) % 360;
    const rad = ((normAngle - 90) * Math.PI) / 180;
    const dotX = 50 + 30 * Math.cos(rad);
    const dotY = 50 + 30 * Math.sin(rad);

    return (
        <div className={cn("flex items-center gap-2 transition-opacity duration-200", disabled && "opacity-40 pointer-events-none")}>
            {/* Angle wheel */}
            <div
                ref={wheelRef}
                onMouseDown={handleWheelMouseDown}
                className={cn(
                    'relative w-8 h-8 rounded-full border-2 border-slate-600 bg-slate-700/40 cursor-grab select-none shrink-0',
                    isDragging && 'cursor-grabbing border-blue-500'
                )}
            >
                <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible">
                    <line x1="50" y1="50" x2={dotX} y2={dotY} stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
                    <circle cx={dotX} cy={dotY} r="10" fill="#3b82f6" />
                </svg>
            </div>
            {/* Angle input - Styled like HexInput */}
            <div className="relative flex-1">
                <Input
                    className="h-7 pr-5 text-xs font-mono text-slate-200 text-right"
                    value={normAngle}
                    disabled={disabled}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onChange={(e) => {
                        const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10);
                        if (!Number.isNaN(val)) onChange(val % 360);
                        else if (e.target.value === '') onChange(0);
                    }}
                />
                <span className={cn(
                    "absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono pointer-events-none transition-colors text-slate-400"
                )}>°</span>
            </div>
        </div>
    );
});
AngleInput.displayName = 'AngleInput';

// ─── GradientControls ─────────────────────────────────────────────────────────

const GradientControls = memo(({ config, onConfigChange }) => {
    const showAngle = config.type === 'linear' || config.type === 'conic';

    return (
        <div className="flex flex-col gap-3">
            {/* Type & Angle selector in one row */}
            <div className="flex items-center gap-2">
                <div className={cn("flex-1", !showAngle && "w-full")}>
                    <Select
                        value={config.type}
                        onValueChange={(v) => onConfigChange(prev => ({ ...prev, type: v }))}
                    >
                        <SelectTrigger className="h-7 bg-slate-700/40 border-2 border-slate-600 text-[10px] text-slate-200 font-bold px-2 w-full">
                            <SelectValue placeholder="Gradient Type" />
                        </SelectTrigger>
                        <SelectContent className="z-[110]">
                            {GRADIENT_TYPES.map(({ value, label }) => (
                                <SelectItem
                                    key={value}
                                    value={value}
                                    className="text-[10px] text-slate-300 focus:bg-slate-800 focus:text-slate-100"
                                >
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex-1">
                    <AngleInput
                        angle={config.angle}
                        disabled={!showAngle}
                        onChange={(a) => onConfigChange(prev => ({ ...prev, angle: a }))}
                    />
                </div>
            </div>

            {/* Gradient stop bar */}
            <GradientStopBar config={config} onConfigChange={onConfigChange} />
        </div>
    );
});
GradientControls.displayName = 'GradientControls';

// ─── ColorPickerField ────────────────────────────────────────────────────────

const ColorPickerField = memo(({ value = '#FFFFFFFF', onChange, className }) => {
    const isInitialGradient = typeof value === 'string' && value.includes('gradient');

    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [popoverIsFocused, setPopoverIsFocused] = useState(false);

    // Local state for hex typing (prevents backspace blocking)
    const [hexInputText, setHexInputText] = useState(null);
    const [isHexFocused, setIsHexFocused] = useState(false);

    const [colorMode, setColorMode] = useState(isInitialGradient ? 'gradient' : 'solid');
    const [isPickerDragging, setIsPickerDragging] = useState(false);

    const [localSolidColor, setLocalSolidColor] = useState(() => {
        if (!isInitialGradient && typeof value === 'string' && value.startsWith('#')) return value;
        // if user opens a gradient, Solid mode needs a valid fallback HEX color, not "linear-gradient(..."
        if (isInitialGradient) {
            const parsed = parseGradientString(value);
            return parsed?.stops[0]?.color || '#FFFFFFFF';
        }
        return '#FFFFFFFF';
    });

    const [gradientConfig, setGradientConfig] = useState(() => {
        if (isInitialGradient) {
            const parsed = parseGradientString(value);
            if (parsed) return parsed;
        }
        const rootStop = createStop(0, '#FFFFFFFF');
        const endStop = createStop(100, '#000000FF');
        return {
            type: 'linear',
            angle: 90,
            stops: [rootStop, endStop],
            activeStopId: rootStop.id,
        };
    });

    const lastGeneratedRef = useRef(value);

    // Update config if value changes externally
    useEffect(() => {
        // Ignore the update if we just generated this exact value
        if (value === lastGeneratedRef.current) return;

        if (typeof value === 'string' && value.includes('gradient')) {
            setColorMode('gradient');
            const parsed = parseGradientString(value);
            if (parsed) {
                setGradientConfig(parsed);
                // Pre-fill solid color fallback so if they click "Solid", it has a valid HEX starting point
                setLocalSolidColor(parsed.stops[0]?.color || '#FFFFFFFF');
            }
        } else if (typeof value === 'string' && value.startsWith('#')) {
            setColorMode('solid');
            setLocalSolidColor(value);
        } else if (!value) {
            setColorMode('solid');
            setLocalSolidColor('#FFFFFFFF');
        }
    }, [value]);

    const blurTimeoutRef = useRef(null);
    const inputRef = useRef(null);

    const isActive = isOpen || isFocused;

    const handleFocus = () => {
        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        setIsFocused(true);
    };

    const handleBlur = () => {
        blurTimeoutRef.current = setTimeout(() => setIsFocused(false), 150);
    };

    const handleOpenChange = (open) => {
        if (open && blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        setIsOpen(open);
    };

    // Derived values
    const activeStop = gradientConfig.stops.find(s => s.id === gradientConfig.activeStopId) ?? gradientConfig.stops[0];
    const solidDisplayHex = getCleanHex(colorMode === 'solid' ? localSolidColor : activeStop.color);

    const currentPickerColor = colorMode === 'solid' ? localSolidColor : activeStop.color;
    const cleanHexLocal = getCleanHex(currentPickerColor);
    const displayHex = isHexFocused ? (hexInputText !== null ? hexInputText : cleanHexLocal) : cleanHexLocal;

    const handlePickerChange = useCallback((newColor) => {
        if (colorMode === 'solid') {
            setLocalSolidColor(newColor);
            lastGeneratedRef.current = newColor;
            onChange(newColor);
        } else {
            setGradientConfig(prev => {
                const next = {
                    ...prev,
                    stops: prev.stops.map(s => s.id === prev.activeStopId ? { ...s, color: newColor } : s),
                };
                const newCss = buildGradientCss(next);
                lastGeneratedRef.current = newCss;
                onChange(newCss);
                return next;
            });
        }
    }, [colorMode, onChange]);

    const handleModeChange = useCallback((newMode) => {
        if (newMode === colorMode) return;
        setColorMode(newMode);

        if (newMode === 'solid') {
            const firstColor = gradientConfig.stops[0]?.color || '#FFFFFFFF';
            setLocalSolidColor(firstColor);
        } else {
            const solidColor = localSolidColor || '#FFFFFFFF';
            setGradientConfig(prev => {
                const next = {
                    ...prev,
                    stops: [
                        createStop(0, solidColor),
                        createStop(100, solidColor)
                    ]
                };
                next.activeStopId = next.stops[0].id;
                return next;
            });
        }
    }, [colorMode, gradientConfig, localSolidColor]);

    const handleGradientConfigChange = useCallback((updater) => {
        setGradientConfig(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            const newCss = buildGradientCss(next);
            lastGeneratedRef.current = newCss;
            onChange(newCss);
            return next;
        });
    }, [onChange]);

    const handleHexInputChange = useCallback((val) => {
        const cleaned = val.replace(/[^0-9A-Fa-f]/g, '').slice(0, 8);
        setHexInputText(cleaned);

        // Optimistically update picker if valid partial
        if (cleaned.length === 3 || cleaned.length === 4 || cleaned.length === 6 || cleaned.length === 8) {
            handlePickerChange(`#${cleaned}`);
        } else if (cleaned.length === 0) {
            // When completely erased, fall back to white so it doesn't crash the color preview
            handlePickerChange('#FFFFFF');
        }
    }, [handlePickerChange]);

    const handleHexBlur = useCallback(() => {
        setIsHexFocused(false);

        if (hexInputText === null || hexInputText === cleanHexLocal) {
            setHexInputText(null);
            return;
        }

        const finalHex = hexInputText;

        if (finalHex.length > 0 && finalHex.length < 3) {
            // Revert back invalid partial strings (like 1 or 2 chars)
            handlePickerChange(currentPickerColor);
        } else if (finalHex.length === 6) {
            // A 6-character hex is perfectly valid. Do not force an alpha channel here.
            handlePickerChange(`#${finalHex}`);
        }

        setHexInputText(null);
    }, [hexInputText, cleanHexLocal, currentPickerColor, handlePickerChange]);

    const handlePickerMouseDown = useCallback((e) => {
        setIsPickerDragging(true);
        const onMouseUp = () => {
            setIsPickerDragging(false);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mouseup', onMouseUp);
    }, []);

    const triggerBg = value;

    return (
        <div className={cn("relative", className)}>
            <style>{PICKER_STYLES}</style>

            <Popover open={isOpen} onOpenChange={handleOpenChange}>
                <PopoverAnchor asChild>
                    <div
                        onClick={() => inputRef.current?.focus()}
                        className={cn(
                            'flex items-center gap-2 h-full px-3 rounded-md transition-all duration-200 border-2 cursor-text w-full',
                            isActive
                                ? 'border-blue-500 bg-slate-700/60'
                                : 'bg-slate-700/40 border-slate-600 hover:border-slate-500 hover:bg-slate-700/60'
                        )}
                    >
                        <div className="flex items-center gap-0.5 flex-1 min-w-[60px]">
                            <span className="text-sm font-mono text-slate-400 select-none leading-none">#</span>
                            <Input
                                ref={inputRef}
                                className="h-6 bg-transparent border-none hover:bg-transparent focus-visible:bg-transparent outline-none focus-visible:ring-0 px-0 w-full min-w-[50px] font-mono text-xs text-slate-200 placeholder:text-slate-600 uppercase shadow-none"
                                value={displayHex}
                                placeholder="FFFFFF"
                                maxLength={8}
                                spellCheck={false}
                                onFocus={(e) => {
                                    handleFocus(e);
                                    setIsHexFocused(true);
                                    setHexInputText(cleanHexLocal);
                                }}
                                onBlur={() => {
                                    handleBlur();
                                    handleHexBlur();
                                }}
                                onChange={(e) => handleHexInputChange(e.target.value)}
                            />
                        </div>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                className="w-6 h-6 rounded-full border border-slate-600 shadow-sm shrink-0 p-0"
                                style={{
                                    background: triggerBg,
                                    backgroundSize: colorMode === 'solid' ? undefined : '100% 100%'
                                }}
                            />
                        </PopoverTrigger>
                    </div>
                </PopoverAnchor>

                <PopoverContent
                    className="w-64 p-3 bg-slate-900 border-2 border-slate-700 shadow-2xl rounded-lg z-[100]"
                    side="bottom"
                    align="end"
                    sideOffset={8}
                >
                    <div className="flex flex-col gap-3">

                        {/* ── Mode Switcher ── */}
                        <Tabs value={colorMode} onValueChange={handleModeChange} className="w-full">
                            <TabsList className="w-full">
                                <TabsTrigger value="solid" className="flex-1 capitalize">
                                    Solid
                                </TabsTrigger>
                                <TabsTrigger value="gradient" className="flex-1 capitalize">
                                    Gradient
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>

                        {/* ── Color Picker ── */}
                        <div
                            className={cn("cpf-picker", isPickerDragging && "is-dragging")}
                            onMouseDown={handlePickerMouseDown}
                        >
                            <HexAlphaColorPicker
                                color={currentPickerColor}
                                onChange={handlePickerChange}
                            />
                        </div>

                        {/* ── Gradient Controls (below picker, opacity-only transition) ── */}
                        <AnimatePresence initial={false}>
                            {colorMode === 'gradient' && (
                                <motion.div
                                    key="gradient-ui"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <GradientControls
                                        config={gradientConfig}
                                        onConfigChange={handleGradientConfigChange}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Hex + Alpha row ── */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 min-w-[60px]">
                                <span className={cn(
                                    'absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-mono pointer-events-none transition-colors text-slate-400'
                                )}>#</span>
                                <Input
                                    className="h-7 pl-5 pr-2 w-full min-w-[50px] text-xs font-mono text-slate-200 uppercase placeholder:text-slate-600"
                                    value={displayHex}
                                    placeholder="FFFFFF"
                                    maxLength={8}
                                    spellCheck={false}
                                    onFocus={() => {
                                        setPopoverIsFocused(true);
                                        setIsHexFocused(true);
                                        setHexInputText(cleanHexLocal);
                                    }}
                                    onBlur={() => {
                                        setPopoverIsFocused(false);
                                        handleHexBlur();
                                    }}
                                    onChange={(e) => handleHexInputChange(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col items-center w-6">
                                <span className="text-xs font-mono text-slate-400 tabular-nums">
                                    {hexToAlpha(currentPickerColor)}%
                                </span>
                            </div>
                        </div>

                        {/* ── Solid Presets ── */}
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Presets</span>
                            <div className="flex flex-wrap gap-1.5">
                                {SOLID_PRESETS.map((color) => {
                                    const currentColor = colorMode === 'solid' ? localSolidColor : activeStop.color;
                                    const isSelected = currentColor.toUpperCase().startsWith(color.toUpperCase());
                                    return (
                                        <Button
                                            key={color}
                                            variant="ghost"
                                            onClick={() => handlePickerChange(color + 'FF')}
                                            className={cn(
                                                'w-5 h-5 rounded-full border-2 transition-all hover:scale-110 active:scale-95 p-0',
                                                isSelected ? 'border-blue-500' : 'border-slate-600'
                                            )}
                                            style={{ backgroundColor: color }}
                                        />
                                    );
                                })}
                            </div>
                        </div>

                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
});

ColorPickerField.displayName = 'ColorPickerField';

export default ColorPickerField;

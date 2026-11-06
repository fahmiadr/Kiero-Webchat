import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, CalendarOff, Clock } from 'lucide-react';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { SmartFormItem, FormControl } from "@/components/ui/form";
import LexicalTextarea from './lexical/LexicalTextarea';
import { TimeRangeSlotField } from './TimeRangeSlot';
import { getNextSlot } from './timeRangeValidation';
import { CredentialInput, Input } from '@/components/ui/input';
import { format, addDays } from 'date-fns';
import { Debouncer } from "@tanstack/pacer";

// ─── Helpers ───────────────────────────────────────────────────────

const parseLocalDate = (dStr) => {
    if (!dStr) return null;
    const baseStr = dStr.includes('T') ? dStr.split('T')[0] : dStr;
    const d = new Date(baseStr + 'T00:00:00');
    return isNaN(d) ? null : d;
};

// ─── Smart Inputs ──────────────────────────────────────────────────

/**
 * SmartDebouncedInput
 * A self-contained debounced input connected to Form Context.
 */
const SmartDebouncedInput = memo(({ name, as: Component = Input, ...props }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name }) || '';
    const [localValue, setLocalValue] = useState(watchedValue);
    const debouncerRef = useRef(null);

    useEffect(() => {
        setLocalValue(watchedValue);
    }, [watchedValue]);

    useEffect(() => {
        debouncerRef.current = new Debouncer((val) => {
            setValue(name, val, {
                shouldDirty: true,
                shouldValidate: true,
                shouldTouch: true
            });
        }, { wait: 500 });
        return () => debouncerRef.current?.cancel();
    }, [name, setValue]);

    const handleChange = useCallback((e) => {
        const val = e.target.value;
        setLocalValue(val);
        debouncerRef.current?.maybeExecute(val);
    }, []);

    return (
        <Component
            {...props}
            value={localValue}
            onChange={handleChange}
        />
    );
});
SmartDebouncedInput.displayName = 'SmartDebouncedInput';

const HolidayNameInput = memo(({ name, index, onRemove, ...props }) => {
    return (
        <FormControl>
            <SmartDebouncedInput
                name={name}
                as={CredentialInput}
                font="default"
                actionIcon={Trash2}
                actionLabel="Remove Holiday"
                onActionClick={() => onRemove(index)}
                actionClassName="text-red-400 hover:text-red-300 hover:bg-red-500/10 bg-transparent border-none"
                {...props}
            />
        </FormControl>
    );
});
HolidayNameInput.displayName = 'HolidayNameInput';

/**
 * SmartDebouncedLexical
 * Self-contained LexicalTextarea connected to Form Context.
 */
const SmartDebouncedLexical = memo(({ name, id, placeholder, className }) => {
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

    const handleChange = useCallback((val) => {
        debouncerRef.current?.maybeExecute(val);
    }, []);

    return (
        <LexicalTextarea
            id={id}
            value={watchedValue || ''}
            onChange={handleChange}
            placeholder={placeholder}
            className={className}
        />
    );
});
SmartDebouncedLexical.displayName = 'SmartDebouncedLexical';

/**
 * SmartHolidayDate
 * Self-contained DateTimePicker connected to Form Context.
 */
const SmartHolidayDate = memo(({ name, placeholder, className, hasTime }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name });

    return (
        <DateTimePicker
            date={parseLocalDate(watchedValue)}
            onDateChange={(date) => {
                setValue(name, date ? format(date, 'yyyy-MM-dd') : null, {
                    shouldDirty: true,
                    shouldValidate: true,
                    shouldTouch: true
                });
            }}
            placeholder={placeholder}
            className={className}
            hasTime={hasTime}
        />
    );
});
SmartHolidayDate.displayName = 'SmartHolidayDate';

const DebouncedHolidayAllDaySwitch = memo(({ name }) => {
    const { control, setValue, formState: { defaultValues } } = useFormContext();
    const isAllDay = useWatch({ control, name }) !== false;
    const hoursName = name.replace('.allDay', '.hours');
    const hours = useWatch({ control, name: hoursName }) || [];

    const handleCheckedChange = useCallback((checked) => {
        const originalAllDay = name.split('.').reduce((acc, part) => acc?.[part], defaultValues);
        const originalHours = hoursName.split('.').reduce((acc, part) => acc?.[part], defaultValues) || [];

        setValue(name, checked, { shouldDirty: true, shouldValidate: true });

        if (!checked) {
            // Toggling OFF: if no hours, add default slot
            if (hours.length === 0) {
                setValue(hoursName, [getNextSlot([])], { shouldDirty: true, shouldValidate: true });
            }
        } else {
            // Toggling back to ON: 
            // If the original state was also allDay: true, restore the original hours (likely [])
            // to satisfy the isDirty check.
            if (originalAllDay !== false) {
                setValue(hoursName, originalHours, { shouldDirty: true, shouldValidate: true });
            }
        }
    }, [name, hoursName, hours, setValue, defaultValues]);

    return (
        <FormControl>
            <Switch
                checked={isAllDay}
                onCheckedChange={handleCheckedChange}
                className="data-[state=checked]:bg-red-600"
            />
        </FormControl>
    );
});
DebouncedHolidayAllDaySwitch.displayName = 'DebouncedHolidayAllDaySwitch';

const HolidayHoursSection = memo(({ name }) => {
    const { control, setValue } = useFormContext();
    const allDayName = name.replace('.hours', '.allDay');
    const isAllDay = useWatch({ control, name: allDayName }) !== false;
    const hours = useWatch({ control, name }) || [];

    const setHours = useCallback((next) => {
        setValue(name, next, {
            shouldDirty: true,
            shouldValidate: true,
            shouldTouch: true
        });
    }, [name, setValue]);

    const handleAddHour = useCallback((newHour) => {
        setHours([...hours, newHour]);
    }, [hours, setHours]);

    const handleRemoveHour = useCallback((idx) => {
        setHours(hours.filter((_, i) => i !== idx));
    }, [hours, setHours]);

    if (isAllDay) return null;

    return (
        <div className="space-y-2 pl-1">
            <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-blue-400" />
                <span className="text-xs font-medium text-slate-400">Opening Hours for This Day</span>
            </div>
            {hours.map((_, idx) => (
                <div key={idx} className="pl-4">
                    <TimeRangeSlotField
                        name={`${name}.${idx}`}
                        slots={hours}
                        index={idx}
                        showRemove={hours.length > 1}
                        onRemove={() => handleRemoveHour(idx)}
                        showAdd={idx === hours.length - 1}
                        onAdd={idx === hours.length - 1 ? () => handleAddHour(getNextSlot(hours)) : undefined}
                    />
                </div>
            ))}
        </div>
    );
});
HolidayHoursSection.displayName = 'HolidayHoursSection';

// ─── Row Components ────────────────────────────────────────────────

const HolidaySmartRow = memo(({ name, index, onRemove }) => {
    const { control } = useFormContext();
    const isAllDay = useWatch({ control, name: `${name}.allDay` }) !== false;

    return (
        <div className="p-4 bg-transparent border border-slate-600 rounded-md space-y-3">
            <SmartFormItem
                name={`${name}.name`}
                label="Holiday Name"
                description="Name of the holiday for identification."
                InputComponent={HolidayNameInput}
                inputProps={{
                    index,
                    onRemove,
                    placeholder: "e.g. Hari Raya",
                    className: "mt-1"
                }}
            />

            <SmartFormItem
                name={`${name}.date`}
                label="Holiday Date"
                description="The specific date for this holiday."
                InputComponent={SmartHolidayDate}
                inputProps={{
                    placeholder: "Select holiday date",
                    className: "w-full h-9 mt-1",
                    hasTime: false
                }}
            />

            <SmartFormItem
                name={`${name}.allDay`}
                label="Closed All Day"
                description={isAllDay ? 'Service closed for 24 hours' : 'Open for partial hours'}
                InputComponent={DebouncedHolidayAllDaySwitch}
                isSwitchLayout
                hideMessage
            />

            <HolidayHoursSection name={`${name}.hours`} />

            <SmartFormItem
                name={`${name}.message`}
                label="Holiday Message"
                description="Custom message sent to users during this holiday."
                InputComponent={SmartDebouncedLexical}
                inputProps={{
                    placeholder: "e.g. Maaf, saat ini kami sedang libur. Kami buka kembali {{buka_berikutnya}}.",
                    id: `holiday-message-${index}`,
                    className: "mt-1 resize-none h-24"
                }}
            />
        </div>
    );
});
HolidaySmartRow.displayName = 'HolidaySmartRow';

const HolidayList = memo(({ onRemove }) => {
    const { control } = useFormContext();
    const holidays = useWatch({ control, name: 'holidays' }) || [];

    if (holidays.length === 0) {
        return (
            <div className="py-8 text-center border-2 border-dashed border-slate-600 bg-transparent rounded-md">
                <CalendarOff className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No holidays added yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {holidays.map((_, index) => (
                <SmartFormItem
                    key={index}
                    name={`holidays.${index}`}
                    InputComponent={HolidaySmartRow}
                    inputProps={{ index, onRemove }}
                    hideMessage
                />
            ))}
        </div>
    );
});
HolidayList.displayName = 'HolidayList';

/**
 * HolidaysTab
 *
 * Optimized Holiday management UI using Smart Row pattern.
 */
const HolidaysTab = memo(() => {
    const { setValue, getValues } = useFormContext();

    const handleAdd = useCallback(() => {
        const current = getValues('holidays') || [];
        const existingDates = current.map(h => h.date).filter(Boolean);

        // Find first available date starting from today
        let targetDate = new Date();
        while (existingDates.includes(format(targetDate, 'yyyy-MM-dd'))) {
            targetDate = addDays(targetDate, 1);
        }

        const dateStr = format(targetDate, 'yyyy-MM-dd');

        setValue('holidays', [
            ...current,
            { name: '', date: dateStr, allDay: true, hours: [], message: '' }
        ], { shouldDirty: true });
    }, [getValues, setValue]);

    const handleRemove = useCallback((index) => {
        const current = getValues('holidays') || [];
        setValue('holidays', current.filter((_, i) => i !== index), { shouldDirty: true });
    }, [getValues, setValue]);

    return (
        <>
            <HolidayList onRemove={handleRemove} />

            <Button
                type="button"
                variant="outline"
                onClick={handleAdd}
                className="w-full border-2 border-dashed border-slate-600 text-slate-200 hover:text-white bg-slate-700/40 hover:bg-slate-700/60 hover:border-slate-500"
            >
                <Plus className="w-4 h-4 mr-2" />
                Add Holiday
            </Button>
        </>
    );
});

HolidaysTab.displayName = 'HolidaysTab';

export default HolidaysTab;

import { memo, useCallback } from 'react';
import { useFormContext, useWatch } from "react-hook-form";
import { Switch } from '@/components/ui/switch';
import { SmartFormItem, FormControl } from "@/components/ui/form";
import { Label } from '@/components/ui/label';
import { TimeRangeSlotField } from './TimeRangeSlot';
import { getNextSlot } from './timeRangeValidation';

const DAYS = [
    { key: '1', label: 'Monday' },
    { key: '2', label: 'Tuesday' },
    { key: '3', label: 'Wednesday' },
    { key: '4', label: 'Thursday' },
    { key: '5', label: 'Friday' },
    { key: '6', label: 'Saturday' },
    { key: '0', label: 'Sunday' },
];


const DayScheduleSmartRow = memo(({ name, label, dayKey }) => {
    const { control, setValue, formState: { defaultValues } } = useFormContext();
    const value = useWatch({ control, name });
    const isDayOpen = value?.active ?? false;
    const ranges = value?.slots ?? [];

    const handleToggleDay = useCallback((checked) => {
        const originalDayConfig = name.split('.').reduce((acc, part) => acc?.[part], defaultValues);

        const nextValue = {
            ...value,
            active: checked
        };

        if (checked) {
            // If enabling and no ranges exist, add default
            if (ranges.length === 0) {
                nextValue.slots = [getNextSlot([])];
            }
        } else {
            // If disabling and originally it was disabled, restore original slots to clear isDirty
            if (originalDayConfig?.active === false) {
                nextValue.slots = originalDayConfig.slots || [];
            }
        }

        setValue(name, nextValue, { shouldDirty: true, shouldValidate: true });
    }, [name, value, ranges.length, setValue, defaultValues]);

    const handleAddRange = useCallback((newRange) => {
        setValue(name, {
            ...value,
            slots: [...ranges, newRange]
        }, { shouldDirty: true });
    }, [name, value, ranges, setValue]);

    const handleRemoveRange = useCallback((idx) => {
        const nextSlots = [...ranges];
        nextSlots.splice(idx, 1);
        setValue(name, {
            ...value,
            slots: nextSlots
        }, { shouldDirty: true, shouldValidate: true });
    }, [name, value, ranges, setValue]);

    return (
        <div className="p-4 bg-transparent border border-slate-600 rounded-md">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Switch
                        checked={isDayOpen}
                        onCheckedChange={handleToggleDay}
                        className="data-[state=checked]:bg-emerald-600"
                    />
                    <Label className={`${!isDayOpen ? 'text-slate-400' : ''}`}>
                        {label}
                    </Label>
                </div>
            </div>

            {isDayOpen && (
                <div className="mt-1 space-y-2 pl-12">
                    {ranges.map((_, idx) => (
                        <TimeRangeSlotField
                            key={idx}
                            name={`${name}.slots.${idx}`}
                            slots={ranges}
                            index={idx}
                            onRemove={() => handleRemoveRange(idx)}
                            showRemove={ranges.length > 1}
                            showAdd={idx === ranges.length - 1}
                            onAdd={idx === ranges.length - 1 ? () => handleAddRange(getNextSlot(ranges)) : undefined}
                        />
                    ))}
                </div>
            )}

            {!isDayOpen && (
                <p className="text-xs text-slate-400 pl-12 mt-1">Closed</p>
            )}
        </div>
    );
});
DayScheduleSmartRow.displayName = 'DayScheduleSmartRow';

const DebouncedOperatingHoursSwitch = memo(({ name }) => {
    const { control, getValues, setValue, formState: { defaultValues } } = useFormContext();
    const value = useWatch({ control, name });

    const handleCheckedChange = useCallback((enabled) => {
        const originalEnabled = defaultValues?.isOperatingHoursEnabled;
        const originalHours = defaultValues?.operatingHours || {};

        setValue(name, enabled, { shouldDirty: true, shouldValidate: true });

        if (enabled) {
            const currentHours = getValues("operatingHours") || {};
            const hasData = Object.values(currentHours).some(day => day.slots && day.slots.length > 0);

            if (!hasData) {
                const defaultSlot = [getNextSlot([])];
                ['0', '1', '2', '3', '4', '5', '6'].forEach(day => {
                    const isDefaultOpen = day !== '0' && day !== '6';
                    setValue(`operatingHours.${day}`, {
                        active: isDefaultOpen,
                        slots: isDefaultOpen ? defaultSlot : []
                    }, { shouldDirty: true, shouldValidate: true });
                });
            }
        } else {
            // Restore all days to baseline if moving back to original disabled state
            if (originalEnabled === false) {
                Object.entries(originalHours).forEach(([day, config]) => {
                    setValue(`operatingHours.${day}`, config, { shouldDirty: true, shouldValidate: true });
                });
            }
        }
    }, [name, getValues, setValue, defaultValues]);

    return (
        <FormControl>
            <Switch
                className="data-[state=checked]:bg-blue-600"
                checked={!!value}
                onCheckedChange={handleCheckedChange}
            />
        </FormControl>
    );
});
DebouncedOperatingHoursSwitch.displayName = 'DebouncedOperatingHoursSwitch';

const DayScheduleList = memo(() => {
    const { control } = useFormContext();
    const isEnabled = useWatch({ control, name: "isOperatingHoursEnabled" });

    if (!isEnabled) return null;

    return (
        <>
            {DAYS.map(({ key, label }) => (
                <SmartFormItem
                    key={key}
                    name={`operatingHours.${key}`}
                    InputComponent={DayScheduleSmartRow}
                    inputProps={{ label, dayKey: key }}
                    hideMessage
                />
            ))}
        </>
    );
});
DayScheduleList.displayName = 'DayScheduleList';

/**
 * OperatingHoursTab
 *
 * Renders 7-day time range inputs for operating hours.
 * Each day can be toggled on/off and supports multiple time ranges (e.g., lunch breaks).
 */
const OperatingHoursTab = memo(() => {
    const { control } = useFormContext();
    const isEnabled = useWatch({ control, name: "isOperatingHoursEnabled" });

    return (
        <>
            <SmartFormItem
                name="isOperatingHoursEnabled"
                label="Enable Operating Hours"
                description={isEnabled ? "Configure daily hours below" : "Disabled = open 24/7"}
                InputComponent={DebouncedOperatingHoursSwitch}
                isSwitchLayout
                hideMessage
            />

            <DayScheduleList />
        </>
    );
});

OperatingHoursTab.displayName = 'OperatingHoursTab';

export default OperatingHoursTab;

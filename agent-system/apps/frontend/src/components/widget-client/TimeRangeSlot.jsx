/**
 * TimeRangeSlot
 *
 * Shared component for rendering a single time range (start — end) with inline validation.
 * Used by both OperatingHoursTab and HolidaysTab.
 */
import { memo, useState, useEffect, useMemo } from 'react';
import { Input, ActionButton } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isInvalidRange, hasOverlap } from './timeRangeValidation';
import { useFormContext, useWatch } from "react-hook-form";
import { SmartFormItem } from "@/components/ui/form";

const TimeRangeSlot = memo(({
    range,
    allRanges,
    index,
    onStartChange,
    onEndChange,
    onRemove,
    showRemove,
    feedbackBorderClass,
}) => {
    const [localStart, setLocalStart] = useState(range?.start || '');
    const [localEnd, setLocalEnd] = useState(range?.end || '');

    // Sync external changes
    useEffect(() => {
        setLocalStart(range?.start || '');
        setLocalEnd(range?.end || '');
    }, [range?.start, range?.end]);

    return (
        <>
            <div className="flex items-center gap-2">
                <Input
                    type="time"
                    value={localStart}
                    onChange={(e) => setLocalStart(e.target.value)}
                    onBlur={() => {
                        if (localStart !== range?.start) onStartChange(localStart);
                    }}
                    className={cn('w-24 [color-scheme:dark]', feedbackBorderClass)}
                />
                <span className="text-slate-400 text-xs">—</span>
                <Input
                    type="time"
                    value={localEnd}
                    onChange={(e) => setLocalEnd(e.target.value)}
                    onBlur={() => {
                        if (localEnd !== range?.end) onEndChange(localEnd);
                    }}
                    className={cn('w-24 [color-scheme:dark]', feedbackBorderClass)}
                />
                {showRemove && (
                    <ActionButton
                        icon={Trash2}
                        label="Remove Slot"
                        onClick={onRemove}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    />
                )}
            </div>
        </>
    );
});

TimeRangeSlot.displayName = 'TimeRangeSlot';

export const SmartTimeRangeSlot = memo(({
    name,
    allRanges,
    index,
    onRemove,
    showRemove,
    feedbackBorderClass,
}) => {
    const { control, setValue } = useFormContext();
    const range = useWatch({ control, name }) || { start: '', end: '' };

    return (
        <TimeRangeSlot
            range={range}
            allRanges={allRanges}
            index={index}
            onStartChange={(val) => setValue(name, { ...range, start: val }, { shouldDirty: true, shouldValidate: true })}
            onEndChange={(val) => setValue(name, { ...range, end: val }, { shouldDirty: true, shouldValidate: true })}
            onRemove={onRemove}
            showRemove={showRemove}
            feedbackBorderClass={feedbackBorderClass}
        />
    );
});
SmartTimeRangeSlot.displayName = 'SmartTimeRangeSlot';

export const TimeRangeSlotField = memo(({ name, slots, index, showRemove, onRemove, showAdd, onAdd }) => {
    const slot = slots[index];
    const customFeedback = useMemo(() => {
        if (!slot) return null;
        if (isInvalidRange(slot.start, slot.end)) {
            return { type: 'invalid', message: 'End must be after start' };
        }
        if (hasOverlap(slots, index)) {
            return { type: 'overlap', message: 'Overlaps another slot' };
        }
        return null;
    }, [slots, index, slot]);

    return (
        <div className="flex flex-col">
            <SmartFormItem
                name={name}
                InputComponent={SmartTimeRangeSlot}
                inputProps={{
                    allRanges: slots,
                    index,
                    showRemove,
                    onRemove
                }}
                customFeedback={customFeedback}
                hideMessage={false}
            />
            {showAdd && onAdd && (
                <div className="pt-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onAdd}
                        className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 w-fit"
                    >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Slot
                    </Button>
                </div>
            )}
        </div>
    );
});
TimeRangeSlotField.displayName = 'TimeRangeSlotField';

export default TimeRangeSlot;

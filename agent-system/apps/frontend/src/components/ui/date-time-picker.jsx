import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

/**
 * DateTimePicker Component
 * A compact date and time picker using shadcn/ui Calendar and Popover
 */
function DateTimePicker({
    date,
    onDateChange,
    placeholder = "Select date",
    label,
    className,
    disabled = false,
    hasTime = true,
}) {
    const [isOpen, setIsOpen] = React.useState(false);

    // Handle calendar date selection
    const handleDateSelect = (selectedDate) => {
        if (!selectedDate) {
            onDateChange(null);
            return;
        }

        // Preserve time from existing date or use current time
        const existingTime = date ? new Date(date) : new Date();
        selectedDate.setHours(existingTime.getHours());
        selectedDate.setMinutes(existingTime.getMinutes());

        onDateChange(selectedDate);
    };

    // Handle time input change
    const handleTimeChange = (e) => {
        const [hours, minutes] = e.target.value.split(':').map(Number);
        const newDate = date ? new Date(date) : new Date();
        newDate.setHours(hours);
        newDate.setMinutes(minutes);
        onDateChange(newDate);
    };

    // Format time for input value (HH:mm)
    const timeValue = date
        ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        : '';

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        "h-8 justify-start text-left font-normal bg-slate-700/40 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500 transition-colors",
                        className
                    )}
                >
                    <CalendarIcon className="h-3.5 w-3.5 text-slate-200 mr-2 flex-shrink-0" />
                    {label && (
                        <span className="text-[10px] text-slate-200 uppercase mr-2 font-medium tracking-wide">{label}</span>
                    )}
                    <span className={cn(
                        "text-xs font-mono",
                        date ? "text-slate-200" : "text-slate-500"
                    )}>
                        {date ? format(date, hasTime ? "MMM dd, HH:mm" : "MMM dd, yyyy") : placeholder}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-auto p-0 bg-slate-950 border border-slate-800 shadow-xl rounded-lg overflow-hidden"
                align="start"
                side="bottom"
                sideOffset={8}
                collisionPadding={16}
            >
                <div className="flex flex-col">
                    {/* Compact Calendar */}
                    <Calendar
                        mode="single"
                        selected={date || undefined}
                        onSelect={handleDateSelect}
                        initialFocus
                        fixedWeeks={false}
                        showOutsideDays={true}
                        className="p-2"
                        classNames={{
                            months: "flex flex-col",
                            month: "space-y-1",
                            caption: "flex justify-center pt-1 relative items-center mb-1",
                            caption_label: "text-sm font-medium text-white",
                            nav: "flex items-center",
                            nav_button: cn(
                                "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-all duration-200"
                            ),
                            nav_button_previous: "absolute left-0",
                            nav_button_next: "absolute right-0",
                            table: "w-full border-collapse",
                            head_row: "flex mb-1",
                            head_cell: "text-slate-500 rounded-md w-8 font-medium text-[10px] uppercase tracking-wider",
                            row: "flex w-full mt-0",
                            cell: cn(
                                "relative p-0 text-center text-xs focus-within:relative focus-within:z-20",
                                "[&:has([aria-selected])]:bg-slate-800/50 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
                            ),
                            day: cn(
                                "h-8 w-8 p-0 font-normal text-slate-300 hover:bg-slate-800 hover:text-white rounded-md cursor-pointer transition-all duration-200 text-xs",
                                "aria-selected:opacity-100"
                            ),
                            day_selected: "bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-500 hover:text-white focus:bg-blue-600 focus:text-white",
                            day_today: "bg-slate-800 text-blue-400 font-medium border border-slate-700",
                            day_outside: "text-slate-700 opacity-40 aria-selected:bg-transparent aria-selected:text-slate-500 aria-selected:opacity-40",
                            day_disabled: "text-slate-700 opacity-30",
                            day_hidden: "invisible",
                        }}
                    />

                    {/* Time Input - Seamless Integration */}
                    {hasTime && (
                        <div className="flex items-center gap-2 p-2 border-t border-slate-800 bg-slate-900/50">
                            <div className="flex items-center gap-2 flex-1">
                                <span className="text-[10px] text-slate-200 uppercase font-medium tracking-wider ml-1">Time</span>
                                <Input
                                    type="time"
                                    value={timeValue}
                                    onChange={handleTimeChange}
                                    className="h-7 w-[85px] [color-scheme:dark] font-mono rounded-md"
                                />
                            </div>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-[10px] uppercase tracking-wider font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 h-7 px-3 rounded-md transition-colors"
                                onClick={() => {
                                    onDateChange(new Date());
                                }}
                            >
                                Now
                            </Button>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export { DateTimePicker };

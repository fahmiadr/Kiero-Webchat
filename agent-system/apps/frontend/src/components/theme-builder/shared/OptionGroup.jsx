import React, { memo } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * A flexible option group component that displays choices as interactive cards.
 * Useful for visual selections like layout, position, etc.
 * 
 * @param {Array} options - List of options: { id, label, renderPreview }
 * @param {string} value - Current selected ID
 * @param {Function} onChange - Callback when an option is selected
 * @param {string} gridClassName - Optional class for the grid container
 * @param {string} buttonClassName - Optional class for the button
 * @param {string} containerClassName - Optional class for the outermost container
 * @param {boolean} showLabel - Whether to show the label below the option
 */
const OptionGroup = memo(({
    options,
    value,
    onChange,
    gridClassName = "grid-cols-2 gap-4",
    buttonClassName = "aspect-video",
    containerClassName = "space-y-3",
    showLabel = true
}) => {
    return (
        <div className={containerClassName}>
            <div className={`grid ${gridClassName}`}>
                {options.map((opt) => {
                    const isActive = value === opt.id;

                    return (
                        <div key={opt.id} className="flex flex-col items-center gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => onChange(opt.id)}
                                className={`peer relative w-full h-auto rounded-md border-2 transition-all duration-200 overflow-hidden p-0 bg-slate-700/40 select-none transform-gpu will-change-transform ${buttonClassName} ${isActive
                                    ? 'border-blue-500 shadow-lg shadow-blue-500/10 cursor-default'
                                    : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/60 hover:scale-[1.02]'
                                    }`}
                            >
                                {opt.renderPreview ? opt.renderPreview(isActive) : null}
                            </Button>


                            {showLabel && (
                                <Label className={`text-xs font-medium transition-colors duration-200 pointer-events-none ${isActive ? 'text-blue-400' : 'text-slate-400 peer-hover:text-slate-200'
                                    }`}>
                                    {opt.label}
                                </Label>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

export default OptionGroup;

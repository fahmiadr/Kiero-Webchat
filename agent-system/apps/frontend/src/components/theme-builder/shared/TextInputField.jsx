import React, { memo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Bold, Italic, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Enhanced text input field with multi-line support and formatting settings.
 * 
 * @param {string} label - Field label
 * @param {string} value - Current text value
 * @param {function} onChange - Text change callback
 * @param {boolean} multiline - Whether to use textarea
 * @param {object} settings - Formatting settings { fontWeight, fontSize, fontSizeUnit, italic }
 * @param {function} onSettingsChange - Settings change callback
 */
const TextInputField = memo(({
    value,
    onChange,
    multiline = false,
    settings = {},
    onSettingsChange
}) => {
    const {
        fontWeight = 'font-normal',
        fontSize = 14,
        fontSizeUnit = 'px',
        italic = false
    } = settings;

    const InputComponent = multiline ? Textarea : Input;

    const fontWeights = [
        { label: 'Thin', value: 'font-thin' },
        { label: 'Extralight', value: 'font-extralight' },
        { label: 'Light', value: 'font-light' },
        { label: 'Normal', value: 'font-normal' },
        { label: 'Medium', value: 'font-medium' },
        { label: 'Semibold', value: 'font-semibold' },
        { label: 'Bold', value: 'font-bold' },
        { label: 'Extrabold', value: 'font-extrabold' },
        { label: 'Black', value: 'font-black' },
    ];

    const updateSetting = (key, val) => {
        if (onSettingsChange) {
            onSettingsChange({ ...settings, [key]: val });
        }
    };

    return (
        <div className="grid gap-2">

            <div className="rounded-md border-2 border-slate-600 bg-slate-700/40 overflow-hidden focus-within:border-blue-500 transition-colors duration-200">
                <InputComponent
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:border-0 hover:border-0 hover:bg-transparent min-h-[40px]"
                />

                {/* Formatting Footer */}
                <div className="flex items-center gap-1 p-1 bg-slate-900 border-t border-slate-700">
                    {/* Font Weight */}
                    <Select
                        value={fontWeight}
                        onValueChange={(val) => updateSetting('fontWeight', val)}
                    >
                        <SelectTrigger className="h-7 w-[110px] bg-transparent border-0 text-[10px] px-2 hover:bg-slate-700/60 focus:ring-0 focus:ring-offset-0">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                                <Bold className="h-3 w-3 shrink-0 text-slate-400" />
                                <SelectValue placeholder="Weight" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                            {fontWeights.map((fw) => (
                                <SelectItem key={fw.value} value={fw.value} className="text-[11px]">
                                    {fw.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="w-px h-4 bg-slate-700 mx-0.5" />

                    {/* Font Size */}
                    <div className="flex items-center h-7 w-[72px] hover:bg-slate-700/60 rounded-md overflow-hidden relative group">
                        <Type className="absolute left-1.5 h-3 w-3 text-slate-400 pointer-events-none z-10" />
                        <Input
                            type="number"
                            value={fontSize}
                            onChange={(e) => updateSetting('fontSize', parseInt(e.target.value) || 0)}
                            className="w-full h-full bg-transparent border-0 text-[10px] pl-5 pr-7 text-slate-200 text-right focus-visible:ring-0 focus-visible:bg-transparent hover:bg-transparent shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none leading-none flex items-center"
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateSetting('fontSizeUnit', fontSizeUnit === 'px' ? 'rem' : 'px')}
                            className="absolute right-1 h-full p-0 text-[9px] font-bold text-slate-500 hover:bg-transparent hover:text-blue-400 transition-all flex items-center justify-center uppercase rounded-none"
                        >
                            <span className="leading-none mt-[1px]">{fontSizeUnit}</span>
                        </Button>
                    </div>


                    <div className="w-px h-4 bg-slate-700 mx-0.5" />

                    {/* Italic Toggle */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateSetting('italic', !italic)}
                        className={cn(
                            "h-7 w-7 p-0 hover:bg-slate-700/60 rounded-md transition-colors",
                            italic ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "text-slate-400 hover:text-slate-200"
                        )}
                    >
                        <Italic className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        </div>
    );
});

export default TextInputField;


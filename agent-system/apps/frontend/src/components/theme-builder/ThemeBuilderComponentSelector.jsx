import React, { memo } from 'react';
import { MessageCircle, CheckCircle2, ArrowRight, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const ThemeBuilderComponentSelector = memo(({ selectedComponent, onSelect }) => {
    const tabs = [
        {
            id: 'launcher',
            label: 'Launcher',
            preview: (
                <div className="relative h-full w-full flex items-end justify-end p-4">
                    <div className="absolute inset-3 rounded-md border border-slate-600 bg-slate-950/70" />
                    <div className="relative h-10 w-10 rounded-full flex items-center justify-center shadow-lg bg-blue-600 ring-2 ring-blue-500/30">
                        <MessageCircle className="h-5 w-5 text-white" />
                    </div>
                </div>
            ),
        },
        {
            id: 'prechat',
            label: 'Pre-chat Form',
            preview: (
                <div className="relative h-full w-full flex items-center justify-center p-2">
                    {/* Mock phone/widget window */}
                    <div className="w-[90%] h-[95%] bg-white rounded-md flex flex-col overflow-hidden shadow-sm origin-top">
                        {/* Header */}
                        <div className="h-6 w-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 flex items-center px-1.5 gap-1 shrink-0 justify-between">
                            <div className="flex items-center gap-1 min-w-0">
                                <div className="h-3 w-3 rounded-full border border-white/30 flex items-center justify-center shrink-0">
                                    <MessageCircle className="h-1.5 w-1.5 text-white" />
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <div className="h-1 w-8 bg-white/90 rounded-full" />
                                    <div className="h-0.5 w-12 bg-white/50 rounded-full" />
                                </div>
                            </div>
                            {/* Minimize Button */}
                            <div className="h-3.5 w-3.5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                <Minus className="h-2 w-2 text-white" />
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 p-1.5 flex flex-col items-center gap-1 min-w-0 overflow-hidden">
                            {/* Avatar */}
                            <div className="h-5 w-5 rounded-md bg-blue-50 flex items-center justify-center mt-0.5 shrink-0">
                                <MessageCircle className="h-2.5 w-2.5 text-blue-500" />
                            </div>
                            {/* Greeting */}
                            <div className="flex flex-col items-center gap-0.5 shrink-0">
                                <div className="h-1.5 w-10 bg-slate-800/80 rounded-full" />
                                <div className="h-0.5 w-16 bg-slate-400/30 rounded-full" />
                            </div>

                            {/* Form Fields - Compact */}
                            <div className="w-full space-y-1.5 mt-2.5 px-0.5">
                                <div className="space-y-0.5">
                                    <div className="h-0.5 w-10 bg-slate-800/50 rounded-full" />
                                    <div className="h-3 w-full bg-slate-50 border border-slate-200/50 rounded-[2px]" />
                                </div>
                                <div className="space-y-0.5">
                                    <div className="h-0.5 w-10 bg-slate-800/50 rounded-full" />
                                    <div className="h-3 w-full bg-slate-50 border border-slate-200/50 rounded-[2px]" />
                                </div>
                            </div>

                            {/* Submit Button - Ensure visible */}
                            <div className="w-full px-0.5 mt-auto pb-1">
                                <div className="h-4 w-full bg-blue-400/90 rounded-sm shadow-sm flex items-center justify-center gap-0.5">
                                    <div className="h-0.5 w-8 bg-white/90 rounded-full" />
                                    <ArrowRight className="h-1.5 w-1.5 text-white/90" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ),
        },
    ];

    return (
        <div className="shrink-0 p-4 border-none bg-transparent z-20">
            <h2 className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-3">Components</h2>
            <div className="grid grid-cols-2 gap-3">
                {tabs.map((tab) => {
                    const isActive = selectedComponent === tab.id;
                    return (
                        <div key={tab.id} className="flex flex-col items-center gap-1.5">
                            {/* Card */}
                            <Button
                                variant="ghost"
                                onClick={() => onSelect(tab.id)}
                                className={`peer relative w-full aspect-[3/4] border-2 rounded-md transition-all duration-200 overflow-hidden p-0 h-auto bg-slate-700/40 ${isActive
                                    ? 'border-blue-500 shadow-lg shadow-blue-500/10 cursor-default'
                                    : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/60 hover:scale-[1.02]'
                                    }`}
                            >
                                {isActive && (
                                    <div className="absolute top-2 right-2 z-10">
                                        <CheckCircle2 className="h-5 w-5 text-blue-400 fill-blue-950" />
                                    </div>
                                )}
                                {tab.preview}
                            </Button>

                            {/* Label — outside card */}
                            <Label className={`text-xs font-medium transition-colors duration-200 pointer-events-none ${isActive ? 'text-blue-400' : 'text-slate-400 peer-hover:text-white'}`}>
                                {tab.label}
                            </Label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

export default ThemeBuilderComponentSelector;

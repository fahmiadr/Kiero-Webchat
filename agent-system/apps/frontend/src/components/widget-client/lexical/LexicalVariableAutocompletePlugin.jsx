// LexicalVariableAutocompletePlugin
// Lexical-native autocomplete for {{variable}} tokens inside a contenteditable editor.
// Trigger: type `{{` — Dismiss: Escape or click outside — Select: arrows + Enter/Tab or click.
// Uses window.getSelection() for caret position (works with contenteditable, unlike .selectionStart).
import React, {
    useState,
    useEffect,
    useCallback,
    useRef,
    useMemo,
    memo,
} from 'react';
import { cn } from '@/lib/utils';
import { Clock, Calendar, MessageSquare, Sparkles, CornerDownLeft } from 'lucide-react';
import {
    useFloating,
    autoUpdate,
    offset,
    flip,
    shift,
    FloatingPortal,
    size,
    useDismiss,
    useInteractions,
} from '@floating-ui/react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_CRITICAL,
    KEY_ARROW_DOWN_COMMAND,
    KEY_ARROW_UP_COMMAND,
    KEY_ENTER_COMMAND,
    KEY_TAB_COMMAND,
    KEY_ESCAPE_COMMAND,
} from 'lexical';

// ─── Variable list (same as VariableAutocomplete) ────────────────
const VARIABLES = [
    { label: 'Next Opening (Full)', value: 'buka_berikutnya}}', displayValue: '{{buka_berikutnya}}', icon: Sparkles },
    { label: 'Today Schedule', value: 'jadwal_hari_ini}}', displayValue: '{{jadwal_hari_ini}}', icon: MessageSquare },
    { label: 'Current Time', value: 'jam}}', displayValue: '{{jam}}', icon: Clock },
    { label: 'Current Date', value: 'tanggal}}', displayValue: '{{tanggal}}', icon: Calendar },
    { label: 'Current Day', value: 'hari}}', displayValue: '{{hari}}', icon: Calendar },
    { label: 'Next Opening Day', value: 'buka_hari}}', displayValue: '{{buka_hari}}', icon: Clock },
    { label: 'Next Opening Time', value: 'buka_jam}}', displayValue: '{{buka_jam}}', icon: Clock },
    { label: 'Next Opening Date', value: 'buka_tanggal}}', displayValue: '{{buka_tanggal}}', icon: Calendar },
];

// ─── Helpers ─────────────────────────────────────────────────────

// Returns a FloatingUI virtual element anchored to the browser's caret position.
function getCaretVirtualElement() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    return { getBoundingClientRect: () => rect };
}

// ─── Dropdown UI ─────────────────────────────────────────────────

const AutocompleteDropdown = memo(({
    filteredVars,
    selectedIndex,
    isKeyboardActive,
    isMouseInteraction,
    onSelect,
    onHover,
    floatingRef,
    floatingStyles,
    floatingProps,
    portalRoot,
}) => {
    const itemRefs = useRef([]);
    const lastMousePos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (isKeyboardActive && itemRefs.current[selectedIndex]) {
            requestAnimationFrame(() => {
                itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            });
        }
    }, [selectedIndex, isKeyboardActive]);

    return (
        <FloatingPortal root={portalRoot}>
            <div
                ref={floatingRef}
                data-floating-autocomplete="true"
                {...floatingProps}
                style={{ ...floatingStyles, zIndex: 1000, pointerEvents: 'auto' }}
                className="w-[240px] bg-slate-900 border border-slate-700/80 rounded-lg shadow-xl flex flex-col overflow-hidden"
            >
                <div className="px-3 py-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <span>Variables</span>
                </div>

                <div className="overflow-y-auto py-1 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-thumb:hover]:cursor-default [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-transparent">
                    {filteredVars.map((v, i) => {
                        const isSelected = isKeyboardActive && i === selectedIndex;
                        const isDefault = !isKeyboardActive && i === selectedIndex;
                        // Show icon if keyboard selected OR if it's the initial default (mouse hasn't moved yet)
                        const showIcon = isSelected || (isDefault && !isMouseInteraction);

                        return (
                            <button
                                key={v.value}
                                ref={(el) => { itemRefs.current[i] = el; }}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onPointerMove={(e) => {
                                    if (e.clientX !== lastMousePos.current.x || e.clientY !== lastMousePos.current.y) {
                                        lastMousePos.current = { x: e.clientX, y: e.clientY };
                                        onHover(i);
                                    }
                                }}
                                onClick={() => onSelect(v)}
                                className={cn(
                                    'flex items-center w-full px-3 py-2 text-sm transition-colors text-left group outline-none cursor-pointer',
                                    'hover:bg-slate-800 border-l-2 pl-[10px]',
                                    isSelected ? 'bg-slate-800 text-white border-l-blue-500'
                                        : isDefault ? 'bg-slate-900 text-slate-300 border-l-transparent'
                                            : 'bg-transparent text-slate-400 border-l-transparent',
                                )}
                            >
                                <v.icon className={cn(
                                    'flex-shrink-0 mr-3 h-4 w-4',
                                    isSelected || isDefault ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400',
                                )} />
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className={cn(
                                        'text-[13px] font-medium truncate leading-none',
                                        isSelected || isDefault ? 'text-white' : '',
                                    )}>
                                        {v.label}
                                    </span>
                                    <code className={cn(
                                        'text-[10px] font-mono truncate mt-1',
                                        isSelected || isDefault ? 'text-blue-100/70' : 'text-slate-500',
                                    )}>
                                        {v.displayValue}
                                    </code>
                                </div>
                                {showIcon && (
                                    <CornerDownLeft className={cn(
                                        "h-3 w-3 flex-shrink-0 ml-2",
                                        isSelected ? "text-blue-400" : "text-slate-600"
                                    )} />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </FloatingPortal>
    );
});
AutocompleteDropdown.displayName = 'AutocompleteDropdown';

// ─── Plugin ───────────────────────────────────────────────────────

export default function LexicalVariableAutocompletePlugin() {
    const [editor] = useLexicalComposerContext();

    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isKeyboardActive, setIsKeyboardActive] = useState(false);
    const [isMouseInteraction, setIsMouseInteraction] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [portalRoot, setPortalRoot] = useState(null);

    const close = useCallback(() => {
        setIsOpen(false);
        setSelectedIndex(0);
        setIsKeyboardActive(false);
        setIsMouseInteraction(false);
        setSearchQuery('');
    }, []);

    const filteredVars = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return VARIABLES.filter(v =>
            v.label.toLowerCase().includes(q) || v.value.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    // Floating UI
    const { refs, floatingStyles, update, context } = useFloating({
        open: isOpen && filteredVars.length > 0,
        onOpenChange: (open) => { if (!open) close(); },
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [
            offset(6),
            flip(),
            shift({ padding: 12 }),
            size({
                apply({ availableHeight, elements }) {
                    Object.assign(elements.floating.style, {
                        maxHeight: `${Math.min(availableHeight, 260)}px`,
                    });
                },
            }),
        ],
        whileElementsMounted: autoUpdate,
    });

    const dismiss = useDismiss(context);
    const { getFloatingProps } = useInteractions([dismiss]);

    // Find the dialog element for the portal root
    useEffect(() => {
        const editorEl = editor.getRootElement();
        if (editorEl) {
            const dialog = editorEl.closest('[role="dialog"]');
            setPortalRoot(dialog || document.body);
        }
    }, [editor]);

    // Anchor FloatingUI to the caret
    const updateAnchor = useCallback(() => {
        const virtualEl = getCaretVirtualElement();
        if (virtualEl) refs.setReference(virtualEl);
    }, [refs]);

    // Insert variable — replaces the `{{query` text with the full token
    const handleSelect = useCallback((variable) => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const anchorNode = selection.anchor.getNode();
            const cursorOffset = selection.anchor.offset;
            const text = anchorNode.getTextContent();
            const textBefore = text.substring(0, cursorOffset);
            const triggerStart = textBefore.lastIndexOf('{{');
            if (triggerStart === -1) return;

            // Select from `{{` to cursor and replace
            selection.anchor.set(anchorNode.getKey(), triggerStart, 'text');
            selection.focus.set(anchorNode.getKey(), cursorOffset, 'text');
            selection.insertText(`{{${variable.value}`);
        });
        close();
        requestAnimationFrame(() => editor.focus());
    }, [editor, close]);

    // Watch Lexical state changes to detect `{{` at cursor
    useEffect(() => {
        return editor.registerUpdateListener(({ editorState, tags }) => {
            // Ignore history (undo/redo) to avoid reopening popup unexpectedly
            if (tags.has('history-merge')) return;

            editorState.read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                    if (isOpen) close();
                    return;
                }
                const anchorNode = selection.anchor.getNode();
                const cursorOffset = selection.anchor.offset;
                const text = anchorNode.getTextContent();
                const textBefore = text.substring(0, cursorOffset);
                const match = textBefore.match(/\{\{([a-zA-Z_]*)$/);

                if (match) {
                    setSearchQuery(match[1]);
                    if (!isOpen) setIsOpen(true);
                    setSelectedIndex(0);
                    requestAnimationFrame(() => {
                        updateAnchor();
                        update();
                    });
                } else if (isOpen) {
                    close();
                }
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, isOpen, close, updateAnchor, update]);

    // Keyboard navigation via Lexical commands (only when popup is open)
    useEffect(() => {
        if (!isOpen) return;

        const unsubs = [
            editor.registerCommand(KEY_ARROW_DOWN_COMMAND, (event) => {
                event.preventDefault();
                setIsKeyboardActive(true);
                setSelectedIndex(p => (p + 1) % filteredVars.length);
                return true;
            }, COMMAND_PRIORITY_CRITICAL),

            editor.registerCommand(KEY_ARROW_UP_COMMAND, (event) => {
                event.preventDefault();
                setIsKeyboardActive(true);
                setSelectedIndex(p => (p - 1 + filteredVars.length) % filteredVars.length);
                return true;
            }, COMMAND_PRIORITY_CRITICAL),

            editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
                if (filteredVars[selectedIndex]) {
                    event?.preventDefault();
                    handleSelect(filteredVars[selectedIndex]);
                    return true;
                }
                return false;
            }, COMMAND_PRIORITY_CRITICAL),

            editor.registerCommand(KEY_TAB_COMMAND, (event) => {
                if (filteredVars[selectedIndex]) {
                    event?.preventDefault();
                    handleSelect(filteredVars[selectedIndex]);
                    return true;
                }
                return false;
            }, COMMAND_PRIORITY_CRITICAL),

            editor.registerCommand(KEY_ESCAPE_COMMAND, (event) => {
                event.preventDefault();
                close();
                return true;
            }, COMMAND_PRIORITY_CRITICAL),
        ];

        return () => unsubs.forEach(fn => fn());
    }, [isOpen, editor, filteredVars, selectedIndex, handleSelect, close]);

    if (!isOpen || filteredVars.length === 0) return null;

    return (
        <AutocompleteDropdown
            filteredVars={filteredVars}
            selectedIndex={selectedIndex}
            isKeyboardActive={isKeyboardActive}
            isMouseInteraction={isMouseInteraction}
            onSelect={handleSelect}
            onHover={(i) => {
                setIsKeyboardActive(false);
                setIsMouseInteraction(true);
                setSelectedIndex(i);
            }}
            floatingRef={refs.setFloating}
            floatingStyles={floatingStyles}
            floatingProps={getFloatingProps()}
            portalRoot={portalRoot}
        />
    );
}

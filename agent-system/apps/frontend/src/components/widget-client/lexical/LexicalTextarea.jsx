/**
 * LexicalTextarea
 *
 * Drop-in replacement for a plain <textarea> with variable highlighting.
 * API: value (string) + onChange(string) — no Event objects.
 *
 * Features:
 *   - Inline {{variable}} highlighting via VariableHighlightPlugin
 *   - Native autocomplete popup via LexicalVariableAutocompletePlugin
 *   - Undo / Redo via HistoryPlugin (Ctrl+Z / Ctrl+Y)
 *   - Variables editable char-by-char; badge breaks gracefully when pattern is broken
 */
import { useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode, $createTextNode, BLUR_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';
import { cn } from '@/lib/utils';
import { VariableNode } from './VariableNode';
import VariableHighlightPlugin from './VariableHighlightPlugin';
import LexicalVariableAutocompletePlugin from './LexicalVariableAutocompletePlugin';

// ─── Helpers ─────────────────────────────────────────────────────

function extractPlainText(editorState) {
    let text = '';
    editorState.read(() => { text = $getRoot().getTextContent(); });
    return text;
}

function setEditorText(editor, text) {
    editor.update(() => {
        const root = $getRoot();
        root.clear();
        const para = $createParagraphNode();
        para.append($createTextNode(text || ''));
        root.append(para);
    });
}

// ─── ValueSyncPlugin ─────────────────────────────────────────────
/**
 * Populates Lexical on mount and re-syncs on external value changes (form reset).
 * Uses lastReportedRef to break echo: our own onChange → parent state → value prop.
 */
function ValueSyncPlugin({ value, lastReportedRef }) {
    const [editor] = useLexicalComposerContext();
    const isMounted = useRef(false);

    // Mount: populate editor
    useEffect(() => {
        if (!isMounted.current) {
            isMounted.current = true;
            setEditorText(editor, value);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // External change (e.g. form.reset)
    useEffect(() => {
        if (!isMounted.current) return;
        if (value === lastReportedRef.current) return; // our own echo — ignore
        lastReportedRef.current = value;
        setEditorText(editor, value);
    }, [value, editor, lastReportedRef]);

    return null;
}

// ─── TrimOnBlurPlugin ────────────────────────────────────────────
function TrimOnBlurPlugin({ onChange, lastReportedRef }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerCommand(
            BLUR_COMMAND,
            () => {
                let currentText = '';
                editor.getEditorState().read(() => {
                    currentText = $getRoot().getTextContent();
                });

                const trimmed = currentText.trim();

                if (currentText !== trimmed) {
                    lastReportedRef.current = trimmed;
                    onChange?.(trimmed);
                    setEditorText(editor, trimmed);
                }

                return false;
            },
            COMMAND_PRIORITY_LOW
        );
    }, [editor, onChange, lastReportedRef]);

    return null;
}

// ─── LexicalErrorBoundary (required by LexicalComposer) ──────────
function LexicalErrorBoundary({ children }) {
    return children;
}

// ─── LexicalTextarea ─────────────────────────────────────────────
const LexicalTextarea = memo(({
    id,
    value = '',
    onChange,
    placeholder,
    className,
    minRows = 3,
    ...props
}) => {
    const lastReportedRef = useRef(value);

    const handleLexicalChange = useCallback((editorState) => {
        const text = extractPlainText(editorState);
        const trimmed = text.trim();

        // Pass strictly trimmed payload up.
        // This makes `ValueSyncPlugin` ignore spaces while typing natively
        // but completely blocks Zod bypasses using whitespace trailing characters.
        if (trimmed === lastReportedRef.current) return;

        lastReportedRef.current = trimmed;
        onChange?.(trimmed);
    }, [onChange]);

    // Stable config — never recreate the editor instance
    const initialConfig = useMemo(() => ({
        namespace: id || 'LexicalTextarea',
        nodes: [VariableNode],
        theme: {
            paragraph: 'm-0',
        },
        onError(error) {
            console.error('[LexicalTextarea]', error);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return (
        <div className={cn(
            "group relative rounded-md border-2 border-slate-600 bg-slate-700/40 transition-all duration-200",
            "hover:border-slate-500 hover:bg-slate-700/60",
            "focus-within:border-blue-500 focus-within:outline-none focus-within:bg-slate-700/60 focus-within:ring-0",
            "hover:focus-within:border-blue-500 hover:focus-within:bg-slate-700/60",
            props["aria-invalid"] ? "border-destructive hover:border-destructive focus-within:border-destructive hover:focus-within:border-destructive" : "",
            className
        )}
            {...props}
        >
            <LexicalComposer initialConfig={initialConfig}>
                <ValueSyncPlugin value={value} lastReportedRef={lastReportedRef} />
                <TrimOnBlurPlugin onChange={onChange} lastReportedRef={lastReportedRef} />
                <HistoryPlugin />
                <VariableHighlightPlugin />
                <LexicalVariableAutocompletePlugin />
                <OnChangePlugin onChange={handleLexicalChange} />

                <PlainTextPlugin
                    contentEditable={
                        <ContentEditable
                            id={id}
                            aria-multiline="true"
                            spellCheck={false}
                            className={cn(
                                'w-full px-3 py-1 text-xs text-slate-200 outline-none border-none bg-transparent',
                                'disabled:cursor-not-allowed disabled:opacity-50',
                                '[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-thumb:hover]:cursor-default [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-transparent',
                            )}
                            style={{
                                minHeight: `${minRows * 1.6}rem`,
                                overflowY: 'auto',
                                wordBreak: 'break-word',
                            }}
                        />
                    }
                    placeholder={
                        <div
                            className="absolute top-1 px-3 pointer-events-none text-xs text-slate-500 select-none"
                            aria-hidden="true"
                        >
                            {placeholder}
                        </div>
                    }
                    ErrorBoundary={LexicalErrorBoundary}
                />
            </LexicalComposer>
        </div>
    );
});

LexicalTextarea.displayName = 'LexicalTextarea';

export default LexicalTextarea;

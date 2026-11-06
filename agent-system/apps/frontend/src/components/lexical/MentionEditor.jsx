/**
 * MentionEditor - Lexical-based editor with mention support
 * Used in AgentBroadcastChat for @mentioning agents
 */
import React, { useEffect, useCallback, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode, $createTextNode, $getSelection, $isRangeSelection, CLEAR_EDITOR_COMMAND, KEY_ENTER_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical';
import { MentionNode, $createMentionNode } from './MentionNode';
import { MentionPlugin } from './MentionPlugin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAvatarColor, getInitials } from '@/utils/avatar';

// Extract plain text from editor state (for sending)
function getPlainTextFromEditorState(editorState) {
    let text = '';
    editorState.read(() => {
        const root = $getRoot();
        text = root.getTextContent();
    });
    return text;
}

// Plugin to clear editor
function ClearEditorPlugin({ shouldClear, onCleared }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (shouldClear) {
            editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
            editor.update(() => {
                const root = $getRoot();
                root.clear();
                const paragraph = $createParagraphNode();
                root.append(paragraph);
                paragraph.select();
            });
            onCleared();
        }
    }, [shouldClear, editor, onCleared]);

    return null;
}

// Plugin to expose editor methods
function EditorRefPlugin({ editorRef, currentUserName }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (editorRef) {
            editorRef.current = {
                focus: () => editor.focus(),
                getText: () => {
                    let text = '';
                    editor.getEditorState().read(() => {
                        text = $getRoot().getTextContent();
                    });
                    return text;
                },
                clear: () => {
                    editor.update(() => {
                        const root = $getRoot();
                        root.clear();
                        const paragraph = $createParagraphNode();
                        root.append(paragraph);
                        paragraph.select();
                    });
                },
                // Insert mention from external source (e.g., sidebar click)
                insertMention: (name) => {
                    editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                            // Insert at cursor position
                            const mentionNode = $createMentionNode(name, name === currentUserName);
                            selection.insertNodes([mentionNode, $createTextNode(' ')]);
                        } else {
                            // Put at end of content
                            const root = $getRoot();
                            const lastParagraph = root.getLastChild();
                            if (lastParagraph) {
                                const mentionNode = $createMentionNode(name, name === currentUserName);
                                lastParagraph.append(mentionNode);
                                lastParagraph.append($createTextNode(' '));
                            }
                        }
                    });
                    editor.focus();
                },
            };
        }
    }, [editor, editorRef, currentUserName]);

    return null;
}

// Plugin for Enter=submit, Shift+Enter=newline
function SubmitOnEnterPlugin({ onSubmit, showSuggestions }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerCommand(
            KEY_ENTER_COMMAND,
            (event) => {
                // If suggestion dropdown is open, let MentionPlugin handle it
                if (showSuggestions) return false;

                // Shift+Enter = newline (default behavior)
                if (event?.shiftKey) return false;

                // Enter = submit
                event?.preventDefault();
                onSubmit?.();
                return true;
            },
            COMMAND_PRIORITY_HIGH
        );
    }, [editor, onSubmit, showSuggestions]);

    return null;
}

// Plugin to enforce character limit (grapheme-based)
// Uses multiple strategies to prevent input BEFORE it happens
function MaxLengthPlugin({ maxLength }) {
    const [editor] = useLexicalComposerContext();
    const isTrimmingRef = useRef(false);

    useEffect(() => {
        if (!maxLength || maxLength <= 0) return;

        const getGraphemeCount = (text) => {
            if (!text) return 0;
            try {
                const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
                return [...segmenter.segment(text)].length;
            } catch (e) {
                return [...text].length;
            }
        };

        const trimToLimit = (text, limit) => {
            try {
                const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
                const graphemes = [...segmenter.segment(text)].map(s => s.segment);
                return graphemes.slice(0, limit).join('');
            } catch (e) {
                return [...text].slice(0, limit).join('');
            }
        };

        // Get root element for beforeinput event
        const rootElement = editor.getRootElement();
        if (!rootElement) return;

        // Intercept beforeinput event (fires before text is inserted)
        const handleBeforeInput = (event) => {
            if (isTrimmingRef.current) return;

            const currentText = editor.getEditorState().read(() => $getRoot().getTextContent());
            const currentCount = getGraphemeCount(currentText);
            const insertedText = event.data || '';
            const insertedCount = getGraphemeCount(insertedText);

            if (currentCount + insertedCount > maxLength) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        // Handle paste events with capture phase - REJECT if exceeds limit (consistent with ChatWindow)
        const handlePaste = (event) => {
            if (isTrimmingRef.current) return;

            const currentText = editor.getEditorState().read(() => $getRoot().getTextContent());
            const currentCount = getGraphemeCount(currentText);
            const pastedText = event.clipboardData?.getData('text/plain') || '';
            const pastedCount = getGraphemeCount(pastedText);

            // Reject entire paste if it would exceed limit
            if (currentCount + pastedCount > maxLength) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        // Fallback: Update listener to trim if somehow exceeded
        const unregister = editor.registerUpdateListener(({ editorState, tags }) => {
            if (isTrimmingRef.current || tags.has('historic')) return;

            editorState.read(() => {
                const text = $getRoot().getTextContent();
                const charCount = getGraphemeCount(text);

                if (charCount > maxLength) {
                    isTrimmingRef.current = true;
                    const trimmedText = trimToLimit(text, maxLength);

                    editor.update(() => {
                        const root = $getRoot();
                        root.clear();
                        const paragraph = $createParagraphNode();
                        paragraph.append($createTextNode(trimmedText));
                        root.append(paragraph);
                        // Move cursor to end
                        paragraph.selectEnd();
                    }, { tag: 'maxlength-trim' });

                    isTrimmingRef.current = false;
                }
            });
        });

        rootElement.addEventListener('beforeinput', handleBeforeInput, true);
        rootElement.addEventListener('paste', handlePaste, true);

        return () => {
            rootElement.removeEventListener('beforeinput', handleBeforeInput, true);
            rootElement.removeEventListener('paste', handlePaste, true);
            unregister();
        };
    }, [editor, maxLength]);

    return null;
}

// Inner component with access to editor context
function MentionEditorInner({
    agents,
    currentUserName,
    placeholder,
    onTextChange,
    editorRef,
    shouldClear,
    onCleared,
    onSubmit,
    maxLength,
}) {
    const mentionData = MentionPlugin({ agents, currentUserName });
    const { showSuggestions, filteredAgents, selectedIndex, insertMention } = mentionData;

    return (
        <>
            <PlainTextPlugin
                contentEditable={
                    <div
                        className="max-h-[60px] overflow-y-auto [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-thumb:hover]:cursor-default [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-transparent"
                    >
                        <ContentEditable
                            className="outline-none min-h-[20px] text-sm leading-5 text-slate-200 placeholder:text-slate-500"
                            aria-placeholder={placeholder}
                        />
                    </div>
                }
                placeholder={
                    <div className="absolute top-0 left-0 text-sm text-slate-500 pointer-events-none">
                        {placeholder}
                    </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <OnChangePlugin
                onChange={(editorState) => {
                    const text = getPlainTextFromEditorState(editorState);
                    onTextChange?.(text);
                }}
            />
            <ClearEditorPlugin shouldClear={shouldClear} onCleared={onCleared} />
            <EditorRefPlugin editorRef={editorRef} currentUserName={currentUserName} />
            <SubmitOnEnterPlugin onSubmit={onSubmit} showSuggestions={showSuggestions} />
            {maxLength && <MaxLengthPlugin maxLength={maxLength} />}

            {/* Mention Suggestions Dropdown */}
            {showSuggestions && filteredAgents.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                    <ScrollArea className="max-h-36">
                        <div className="p-1.5">
                            {filteredAgents.map((agent, idx) => (
                                <button
                                    key={agent.id}
                                    type="button"
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm rounded-lg transition-all ${selectedIndex === idx
                                        ? 'bg-blue-600 text-white'
                                        : 'hover:bg-slate-700/70 text-slate-200'
                                        }`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        insertMention(agent.name);
                                    }}
                                >
                                    <Avatar className="h-6 w-6 border border-slate-600">
                                        <AvatarFallback className={`text-[9px] ${getAvatarColor(agent.name)} text-white`}>
                                            {getInitials(agent.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{agent.name}</span>
                                </button>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </>
    );
}

// Main exported component
export default function MentionEditor({
    agents = [],
    currentUserName,
    placeholder = 'Type a message...',
    onTextChange,
    editorRef,
    shouldClear = false,
    onCleared = () => { },
    onSubmit,
    maxLength,
}) {
    const theme = {
        paragraph: 'mb-0',
    };

    const initialConfig = {
        namespace: 'MentionEditor',
        theme,
        onError: (error) => console.error('Lexical Error:', error),
        nodes: [MentionNode],
    };

    return (
        <div className="relative w-full">
            <LexicalComposer initialConfig={initialConfig}>
                <MentionEditorInner
                    agents={agents}
                    currentUserName={currentUserName}
                    placeholder={placeholder}
                    onTextChange={onTextChange}
                    editorRef={editorRef}
                    shouldClear={shouldClear}
                    onCleared={onCleared}
                    onSubmit={onSubmit}
                    maxLength={maxLength}
                />
            </LexicalComposer>
        </div>
    );
}

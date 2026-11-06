/**
 * MentionPlugin - Lexical plugin for detecting @ and showing suggestions
 */
import { useEffect, useCallback, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $getSelection,
    $isRangeSelection,
    $createTextNode,
    KEY_ARROW_DOWN_COMMAND,
    KEY_ARROW_UP_COMMAND,
    KEY_ENTER_COMMAND,
    KEY_ESCAPE_COMMAND,
    KEY_TAB_COMMAND,
    COMMAND_PRIORITY_HIGH,
} from 'lexical';
import { $createMentionNode } from './MentionNode';

export function MentionPlugin({ agents = [], currentUserName, onMentionSearch }) {
    const [editor] = useLexicalComposerContext();
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredAgents, setFilteredAgents] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);

    // Check for @ trigger while typing
    useEffect(() => {
        return editor.registerTextContentListener((textContent) => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) return;

                const anchor = selection.anchor;
                const anchorNode = anchor.getNode();
                const textContentUpToCursor = anchorNode.getTextContent().slice(0, anchor.offset);

                // Find last @ before cursor
                const lastAtIndex = textContentUpToCursor.lastIndexOf('@');

                if (lastAtIndex !== -1) {
                    const query = textContentUpToCursor.slice(lastAtIndex + 1);

                    // Only show suggestions if no space in query (typing mention)
                    if (!query.includes(' ') && query.length >= 0) {
                        setMentionQuery(query);
                        setMentionStartIndex(lastAtIndex);

                        const filtered = agents.filter(a =>
                            a.name.toLowerCase().includes(query.toLowerCase()) &&
                            a.name !== currentUserName
                        );

                        setFilteredAgents(filtered);
                        setShowSuggestions(filtered.length > 0);
                        setSelectedIndex(0);
                        return;
                    }
                }

                setShowSuggestions(false);
            });
        });
    }, [editor, agents, currentUserName]);

    // Insert mention node
    const insertMention = useCallback((agentName) => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();
            const textContent = anchorNode.getTextContent();

            // Find the @ position
            const textUpToCursor = textContent.slice(0, anchor.offset);
            const lastAtIndex = textUpToCursor.lastIndexOf('@');

            if (lastAtIndex !== -1) {
                // Create new text content without the @query
                const beforeAt = textContent.slice(0, lastAtIndex);
                const afterCursor = textContent.slice(anchor.offset);

                // Set new text content
                anchorNode.setTextContent(beforeAt);

                // Insert mention node
                const mentionNode = $createMentionNode(agentName, agentName === currentUserName);
                anchorNode.insertAfter(mentionNode);

                // Add space and remaining text after mention
                const spaceNode = $createTextNode(' ' + afterCursor);
                mentionNode.insertAfter(spaceNode);

                // Move selection after the space
                spaceNode.select(1, 1);
            }
        });
        setShowSuggestions(false);
    }, [editor, currentUserName]);

    // Handle keyboard navigation
    useEffect(() => {
        const removeArrowDown = editor.registerCommand(
            KEY_ARROW_DOWN_COMMAND,
            () => {
                if (!showSuggestions) return false;
                setSelectedIndex(prev => (prev + 1) % filteredAgents.length);
                return true;
            },
            COMMAND_PRIORITY_HIGH
        );

        const removeArrowUp = editor.registerCommand(
            KEY_ARROW_UP_COMMAND,
            () => {
                if (!showSuggestions) return false;
                setSelectedIndex(prev => (prev - 1 + filteredAgents.length) % filteredAgents.length);
                return true;
            },
            COMMAND_PRIORITY_HIGH
        );

        const removeEnter = editor.registerCommand(
            KEY_ENTER_COMMAND,
            (event) => {
                if (!showSuggestions || filteredAgents.length === 0) return false;
                event?.preventDefault();
                insertMention(filteredAgents[selectedIndex].name);
                return true;
            },
            COMMAND_PRIORITY_HIGH
        );

        const removeTab = editor.registerCommand(
            KEY_TAB_COMMAND,
            (event) => {
                if (!showSuggestions || filteredAgents.length === 0) return false;
                event?.preventDefault();
                insertMention(filteredAgents[selectedIndex].name);
                return true;
            },
            COMMAND_PRIORITY_HIGH
        );

        const removeEscape = editor.registerCommand(
            KEY_ESCAPE_COMMAND,
            () => {
                if (!showSuggestions) return false;
                setShowSuggestions(false);
                return true;
            },
            COMMAND_PRIORITY_HIGH
        );

        return () => {
            removeArrowDown();
            removeArrowUp();
            removeEnter();
            removeTab();
            removeEscape();
        };
    }, [editor, showSuggestions, filteredAgents, selectedIndex, insertMention]);

    return {
        showSuggestions,
        filteredAgents,
        selectedIndex,
        insertMention,
    };
}

/**
 * VariableHighlightPlugin
 *
 * Uses the official `useLexicalTextEntity` hook to convert plain text matching
 * /{{variable_name}}/ into VariableNode instances — and back to plain TextNode
 * when the text is edited so it no longer matches.
 *
 * This is the recommended Lexical pattern for inline styling of text patterns.
 */
import { useCallback } from 'react';
import { useLexicalTextEntity } from '@lexical/react/useLexicalTextEntity';
import { $createVariableNode, VariableNode } from './VariableNode';

// Matches the full `{{variable_name}}` token.
const VARIABLE_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/;

/**
 * Finds the *single* variable match within a text node's text.
 * `useLexicalTextEntity` expects a function with this exact signature.
 */
function findVariableMatch(text) {
    const match = VARIABLE_REGEX.exec(text);
    if (match === null) return null;
    return {
        start: match.index,
        end: match.index + match[0].length,
    };
}

/**
 * VariableHighlightPlugin
 *
 * Must be placed as a child of LexicalComposer.
 * Registers the VariableNode type and continuously transforms matching text.
 */
export default function VariableHighlightPlugin() {
    const createNode = useCallback((textNode) => {
        return $createVariableNode(textNode.getTextContent());
    }, []);

    const getMatch = useCallback((text) => {
        return findVariableMatch(text);
    }, []);

    useLexicalTextEntity(getMatch, VariableNode, createNode);

    return null;
}

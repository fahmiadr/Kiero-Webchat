/**
 * VariableNode
 *
 * A TextNode subclass that represents an `{{variable}}` token.
 * Because it extends TextNode (not DecoratorNode), Lexical treats it as
 * editable text — the user can delete characters inside it freely.
 * Once the text no longer matches the {{...}} pattern the VariableHighlightPlugin
 * will automatically convert it back to a plain TextNode.
 */
import { TextNode } from 'lexical';

export class VariableNode extends TextNode {
    static getType() {
        return 'variable';
    }

    static clone(node) {
        return new VariableNode(node.__text, node.__key);
    }

    // Override to mark this as a non-simple text node so Lexical
    // doesn't merge it with adjacent plain TextNodes.
    isSimpleText() {
        return false;
    }

    // Render the styled span
    createDOM(config) {
        const dom = super.createDOM(config);
        dom.className = [
            'variable-token',          // utility for targeting with CSS if needed
            'inline-flex',
            'items-center',
            'rounded',
            'px-1',
            'bg-blue-500/20',
            'text-blue-300',
            'border',
            'border-blue-500/30',
            'font-mono',
            'text-[0.8em]',
            'leading-relaxed',
            'cursor-text',
        ].join(' ');
        return dom;
    }

    updateDOM(prevNode, dom, config) {
        // Let parent handle text content updates
        const updated = super.updateDOM(prevNode, dom, config);
        return updated;
    }

    static importJSON(serializedNode) {
        const node = $createVariableNode(serializedNode.text);
        node.setFormat(serializedNode.format);
        node.setDetail(serializedNode.detail);
        node.setMode(serializedNode.mode);
        node.setStyle(serializedNode.style);
        return node;
    }

    exportJSON() {
        return {
            ...super.exportJSON(),
            type: 'variable',
            version: 1,
        };
    }
}

/**
 * Factory function — preferred Lexical pattern
 */
export function $createVariableNode(text) {
    return new VariableNode(text).setMode('normal');
}

/**
 * Type guard
 */
export function $isVariableNode(node) {
    return node instanceof VariableNode;
}

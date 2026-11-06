/**
 * MentionNode - Custom Lexical node for @mentions
 * Renders as styled inline block with highlight
 */
import { DecoratorNode } from 'lexical';

export class MentionNode extends DecoratorNode {
    __mention;
    __isCurrentUser;

    static getType() {
        return 'mention';
    }

    static clone(node) {
        return new MentionNode(node.__mention, node.__isCurrentUser, node.__key);
    }

    constructor(mention, isCurrentUser = false, key) {
        super(key);
        this.__mention = mention;
        this.__isCurrentUser = isCurrentUser;
    }

    createDOM() {
        const span = document.createElement('span');
        span.className = this.__isCurrentUser
            ? 'inline rounded-sm px-1 py-px bg-yellow-500/25 text-yellow-300 font-medium text-xs'
            : 'inline rounded-sm px-1 py-px bg-blue-500/25 text-blue-300 font-medium text-xs';
        span.textContent = `@${this.__mention}`;
        return span;
    }

    updateDOM() {
        return false;
    }

    decorate() {
        return null;
    }

    static importJSON(serializedNode) {
        const node = $createMentionNode(serializedNode.mention, serializedNode.isCurrentUser);
        return node;
    }

    exportJSON() {
        return {
            mention: this.__mention,
            isCurrentUser: this.__isCurrentUser,
            type: 'mention',
            version: 1,
        };
    }

    getTextContent() {
        return `@${this.__mention}`;
    }

    getMention() {
        return this.__mention;
    }

    isCurrentUser() {
        return this.__isCurrentUser;
    }
}

export function $createMentionNode(mention, isCurrentUser = false) {
    return new MentionNode(mention, isCurrentUser);
}

export function $isMentionNode(node) {
    return node instanceof MentionNode;
}

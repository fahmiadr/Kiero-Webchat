import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import MessageBubble from './MessageBubble';

/**
 * TypingIndicator
 * Uses framer-motion and the standard MessageBubble to perfectly mirror the
 * widget's typing indicator experience (animations + DOM structure).
 */
const TypingIndicator = ({ name = 'Customer', isVisible = true }) => {
    // Generate a dummy message object to render in the bubble
    const message = useMemo(
        () => ({
            id: 'typing-indicator',
            sender: 'visitor', // Ensure it renders on the left side
            content: 'Typing...',
        }),
        []
    );

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="flex w-full"
                >
                    <div className="flex w-full items-end gap-2 mt-2">
                        <MessageBubble
                            message={message}
                            isFirstInGroup={true}
                            isLastInGroup={true}
                            senderName={name}
                            isAgent={false} // Renders on the left
                            senderType="visitor"
                            isTyping={true}
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default TypingIndicator;

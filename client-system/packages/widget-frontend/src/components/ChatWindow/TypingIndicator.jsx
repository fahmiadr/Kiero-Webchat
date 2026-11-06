import { AnimatePresence, m } from 'framer-motion';
import { useMemo } from 'react';
import MessageBubble from './MessageBubble';

const TypingIndicator = ({
  agentName = 'Bot',
  isVisible = true,
  isBot = false,
  agentRole,
  agentId,
}) => {
  const message = useMemo(
    () => ({
      id: 'typing-indicator',
      sender: isBot ? 'bot' : 'agent',
      content: 'Typing...', // Placeholder, will be overridden by isTyping
      agentRole: agentRole,
    }),
    [isBot, agentRole],
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex w-full"
        >
          <div className="flex w-full items-end gap-2 pr-12">
            <MessageBubble
              message={message}
              isFirstInGroup={true}
              showAvatar={true}
              senderName={agentName}
              agentId={agentId}
              isTyping={true}
              isBot={isBot}
            />
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
};

export default TypingIndicator;

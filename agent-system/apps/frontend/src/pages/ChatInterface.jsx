import { useState, useEffect, useRef } from 'react';
import ActiveChatList from '@/components/chat/ActiveChatList';
import ChatWindow from '@/components/chat/ChatWindow';
import { useActiveChats, useChatMessages, useSendMessage, useHandleChat, useCloseChat, useGlobalMessageListener, useTransferChat } from '@/hooks/useChat';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import useAuthStore from '@/stores/useAuthStore';

const ChatInterface = () => {
    const user = useAuthStore(state => state.user);
    const [activeChatId, setActiveChatId] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef(null);

    // Confirmation State
    const [confirmDialog, setConfirmDialog] = useState({
        isOpen: false,
        type: null, // 'handle' | 'close'
        chatId: null
    });

    // React Query Hooks
    useGlobalMessageListener();
    const { data: chats = [] } = useActiveChats();
    const { data: messages = [] } = useChatMessages(activeChatId);
    const { mutate: sendMessage } = useSendMessage();
    const { mutate: handleChat } = useHandleChat();
    const { mutate: closeChat } = useCloseChat();
    const { mutateAsync: transferChat } = useTransferChat();

    const handleSendMessage = (content, attachments = []) => {
        if ((!content?.trim() && attachments.length === 0) || !activeChatId) return;

        const messageContent = content?.trim() || '';
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setInputValue(''); // Optimistic clear

        sendMessage({ chatId: activeChatId, content: messageContent, tempId, attachments }, {
            onError: (error) => {
                console.error("Failed to send message", error);
                setInputValue(messageContent); // Restore on error
            }
        });
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(inputValue);
        }
    };

    // Action Handlers
    const onHandleChat = (chatId) => {
        setConfirmDialog({
            isOpen: true,
            type: 'handle',
            chatId
        });
    };

    const onCloseChat = (chatId) => {
        setConfirmDialog({
            isOpen: true,
            type: 'close',
            chatId
        });
    };

    const handleTransferChat = async (targetAgent) => {
        if (!activeChatId) return;
        return transferChat({ chatId: activeChatId, targetAgent });
    };

    const handleConfirmAction = () => {
        const { type, chatId } = confirmDialog;
        if (!chatId) return;

        if (type === 'handle') {
            handleChat({ chatId, agentName: user?.name });
        } else if (type === 'close') {
            closeChat({ chatId });
            setActiveChatId(null); // Deselect on close
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    };

    const activeChat = chats.find(c => c.id === activeChatId);

    return (
        <div className="flex h-full min-w-0 overflow-hidden bg-slate-950 text-slate-900 dark:text-slate-100 font-sans p-4 gap-3">
            <ActiveChatList
                chats={chats}
                activeChatId={activeChatId}
                onSelectChat={setActiveChatId}
            />

            <ChatWindow
                activeChat={activeChat}
                messages={messages}
                inputValue={inputValue}
                setInputValue={setInputValue}
                onSendMessage={handleSendMessage}
                onKeyPress={handleKeyPress}
                messagesEndRef={messagesEndRef}
                onHandleChat={onHandleChat}
                onCloseChat={onCloseChat}
                onTransferChat={handleTransferChat}
                currentUser={user}
            />


            {/* Confirmation Dialog */}
            <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmDialog.type === 'handle' ? 'Take over this chat?' : 'Close this chat?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            {confirmDialog.type === 'handle'
                                ? "You will become the primary agent for this conversation. The customer will be notified."
                                : "This conversation will be marked as closed and moved to history. You can still access it later."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmAction}
                            className={`${confirmDialog.type === 'handle' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} text-white border-none cursor-pointer`}
                        >
                            {confirmDialog.type === 'handle' ? 'Confirm Handle' : 'Close Chat'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ChatInterface;

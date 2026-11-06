import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X, Send, Users, MessageSquare } from 'lucide-react';
import { socket } from '@/lib/socket';
import useAuthStore from '@/stores/useAuthStore';
import { getAvatarColor, getInitials } from '@/utils/avatar';
import { formatDateLabel as getDateLabel } from '@/utils/formatUtils';
import MessageBubble from './MessageBubble';
import DateSeparator from './DateSeparator';
import UnreadDivider from './UnreadDivider';
import MentionEditor from '@/components/lexical/MentionEditor';

const AgentBroadcastChat = ({ isOpen, onClose, onlineAgents = [], showOnlinePanel, setShowOnlinePanel, messages = [], firstUnreadIndex = -1 }) => {
    const [inputValue, setInputValue] = useState('');
    const [shouldClearEditor, setShouldClearEditor] = useState(false);
    // showOnlinePanel state lifted to parent
    const scrollRef = useRef(null);
    const unreadRef = useRef(null);
    const user = useAuthStore(state => state.user);
    const editorRef = useRef(null);
    const [showUnreadDivider, setShowUnreadDivider] = useState(true);
    const hasInitialScrolledRef = useRef(false);

    // Sticky Header Logic
    const [isScrolling, setIsScrolling] = useState(false);
    const scrollTimeout = useRef(null);
    const [scrollViewport, setScrollViewport] = useState(null);

    // ============================================================
    // CHARACTER LIMIT (Grapheme-based for accurate emoji counting)
    // ============================================================
    const MAX_MESSAGE_LENGTH = 300; // Broadcast has stricter limit

    // Helper: Count graphemes (visual characters) using Intl.Segmenter
    const getGraphemeCount = (text) => {
        if (!text) return 0;
        try {
            const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
            return [...segmenter.segment(text)].length;
        } catch (e) {
            return [...text].length;
        }
    };

    // Current character count (memoized for performance)
    const charCount = useMemo(() => getGraphemeCount(inputValue), [inputValue]);

    // Capture ScrollArea viewport for IntersectionObserver root
    useLayoutEffect(() => {
        if (scrollRef.current) {
            const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            setScrollViewport(viewport);
        }
    }, []);

    const handleScroll = () => {
        if (!isScrolling) setIsScrolling(true);
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        scrollTimeout.current = setTimeout(() => {
            setIsScrolling(false);
        }, 1500);
    };

    // Group messages by date label for sticky section headers
    const groupedMessages = useMemo(() => {
        const groups = {};
        messages.forEach(msg => {
            const dateLabel = getDateLabel(msg.timestamp || msg.createdAt);
            if (!groups[dateLabel]) {
                groups[dateLabel] = [];
            }
            groups[dateLabel].push(msg);
        });
        return groups;
    }, [messages]);

    // Smart Scroll Logic with Unread Support
    useEffect(() => {
        if (!scrollRef.current || !isOpen) return;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const scrollContainer = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
                if (!scrollContainer) return;

                const isInitialLoad = !hasInitialScrolledRef.current;
                const hasUnread = firstUnreadIndex >= 0;

                const scrollToElement = (element) => {
                    if (!element) return;
                    const containerTop = scrollContainer.getBoundingClientRect().top;
                    const elementTop = element.getBoundingClientRect().top;
                    const containerHeight = scrollContainer.clientHeight;
                    const elementHeight = element.clientHeight;
                    const targetScrollTop = scrollContainer.scrollTop + (elementTop - containerTop) - (containerHeight / 2) + (elementHeight / 2);

                    // INSTANT scroll for initial load to avoid "jumpy" animation
                    if (isInitialLoad) {
                        scrollContainer.scrollTop = Math.max(0, targetScrollTop);
                        hasInitialScrolledRef.current = true;
                    } else {
                        scrollContainer.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
                    }
                };

                const scrollToBottom = () => {
                    if (isInitialLoad) {
                        scrollContainer.scrollTop = scrollContainer.scrollHeight;
                        hasInitialScrolledRef.current = true;
                    } else {
                        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
                    }
                };

                // Prioritize unread message scroll
                if (hasUnread && unreadRef.current) {
                    scrollToElement(unreadRef.current);
                } else if (!hasUnread) {
                    // Only scroll to bottom if there are no unread messages
                    // Use a small timeout to ensuring rendering is complete
                    scrollToBottom();
                }
            });
        });
    }, [messages, isOpen, firstUnreadIndex]);

    // Reset unread divider and scroll state when chat opens
    useEffect(() => {
        if (isOpen) {
            setShowUnreadDivider(true);
            hasInitialScrolledRef.current = false; // Reset for new open session

            // Auto-hide unread divider after 5 seconds
            const timer = setTimeout(() => setShowUnreadDivider(false), 5000);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Memoized Online Agent Item
    const OnlineAgentItem = React.memo(({ agent, isCurrentUser, onMention }) => (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    onClick={() => onMention(agent.name)}
                    className="w-full flex items-center justify-start gap-3 p-2 h-auto hover:bg-slate-800/80 rounded-lg text-left group transition-all border border-transparent hover:border-slate-700 cursor-pointer"
                >
                    <div className="relative shrink-0">
                        <Avatar className="h-8 w-8 border border-slate-800 shadow-sm">
                            <AvatarFallback className={`text-[10px] ${getAvatarColor(agent.name)} text-white font-bold`}>
                                {getInitials(agent.name)}
                            </AvatarFallback>
                        </Avatar>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-slate-900" />
                    </div>
                    <div className="flex flex-col min-w-0 items-start">
                        <span className="text-sm text-slate-200 font-medium truncate group-hover:text-white">
                            {agent.type === 'bot' ? '🤖 ' : ''}{agent.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                            {isCurrentUser ? 'Anda' : 'Online'}
                        </span>
                    </div>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={5} className="z-[70] text-[10px] px-2 py-1 h-auto min-h-0 bg-slate-900 border-slate-700 text-slate-200">
                <p>Mention <span className="font-bold">{agent.name}</span></p>
            </TooltipContent>
        </Tooltip>
    ));

    // Socket listener removed: Logic handled in BroadcastChatManager for persistence
    // Memoize handleSend to prevent re-creation
    const handleSend = useCallback(() => {
        if (!inputValue.trim() || !user) return;

        const payload = {
            id: Date.now().toString(),
            sender: user.name || 'Agent',
            content: inputValue.trim(),
            timestamp: new Date().toISOString()
        };

        // Emit to server (server will broadcast back to us too)
        socket.emit('agent:broadcast_message', payload);
        setInputValue('');
        setShouldClearEditor(true); // Trigger Lexical editor clear
    }, [inputValue, user]);

    // Handle direct mention click from sidebar
    const handleMention = useCallback((name) => {
        // Insert styled MentionNode into Lexical editor
        editorRef.current?.insertMention(name);
    }, []);

    if (!isOpen) return null;

    return (
        <Card className="flex flex-col shadow-xl border border-slate-700 bg-slate-900 overflow-hidden w-80 h-[400px] animate-in zoom-in-95 origin-bottom-right transition-all">
            {/* Header */}
            <div className="p-3 border-b border-slate-800 flex justify-between items-center backdrop-blur shrink-0 z-50 relative">
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)] shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-slate-100 text-sm leading-none mb-1">Team Broadcast</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-slate-400 shrink-0">{onlineAgents.length} Online</span>
                            <div className="flex -space-x-1.5 overflow-hidden max-w-[100px] mask-linear-fade">
                                {onlineAgents.slice(0, 8).map((agent, i) => (
                                    <Tooltip key={agent.id || i} delayDuration={500}>
                                        <TooltipTrigger asChild>
                                            <div className="relative group/viewer cursor-help">
                                                <Avatar className="h-4.5 w-4.5 border border-slate-900 ring-1 ring-slate-800">
                                                    <AvatarFallback className={`text-[8px] ${getAvatarColor(agent.name)} text-white font-bold`}>
                                                        {getInitials(agent.name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="z-[70] text-[10px] px-2 py-1 h-auto min-h-0 bg-slate-900 border-slate-700 text-slate-200">
                                            <p>{agent.name}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 transition-colors cursor-pointer ${showOnlinePanel ? 'bg-blue-900/50 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
                                onClick={() => setShowOnlinePanel(!showOnlinePanel)}
                            >
                                <Users className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="z-[70] text-[10px] px-2 py-1 h-auto min-h-0 bg-slate-900 border-slate-700 text-slate-200">
                            <p>Online Agents</p>
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                            <Button variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-950/20 cursor-pointer"
                                onClick={onClose}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="z-[70] text-[10px] px-2 py-1 h-auto min-h-0 bg-slate-900 border-slate-700 text-slate-200">
                            <p>Close</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <div className="flex flex-col flex-1 min-h-0 relative bg-slate-950/30">
                {/* Online Agents Overlay */}
                {showOnlinePanel && (
                    <div className="absolute inset-0 z-40 bg-slate-900/95 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-5 duration-200 flex flex-col">
                        <div className="p-3 border-b border-slate-800 flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Online Agents</span>
                        </div>
                        <ScrollArea className="flex-1 p-2">
                            <div className="space-y-1">
                                {onlineAgents.map((agent) => (
                                    <OnlineAgentItem
                                        key={agent.id}
                                        agent={agent}
                                        isCurrentUser={agent.name === user?.name}
                                        onMention={(name) => {
                                            handleMention(name);
                                            setShowOnlinePanel(false);
                                        }}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                )}

                {/* Main Chat Messages */}
                <ScrollArea ref={scrollRef} viewportRef={setScrollViewport} className="flex-1 bg-slate-900" onScrollCapture={handleScroll}>
                    <div className="p-2">
                        {Object.entries(groupedMessages).map(([dateLabel, groupMessages], groupIdx) => (
                            <div key={dateLabel} className="relative pb-2">
                                {/* Sticky Date Header for the Group */}
                                <DateSeparator label={dateLabel} compact visible={isScrolling} root={scrollViewport} />

                                {/* Messages in this Group */}
                                <div className="flex flex-col">
                                    {groupMessages.map((msg, idx) => {
                                        const isMe = msg.sender === (user?.name || 'Agent');

                                        // Determine global index for unread logic
                                        const globalIndex = messages.findIndex(m => m.id === msg.id);
                                        const isFirstUnread = globalIndex === firstUnreadIndex;
                                        const unreadCount = firstUnreadIndex >= 0 ? messages.length - firstUnreadIndex : 0;

                                        // Grouping Logic (Visual grouping within date section)
                                        const prevMsg = groupMessages[idx - 1];
                                        const nextMsg = groupMessages[idx + 1];
                                        const isFirstInGroup = !prevMsg || prevMsg.sender !== msg.sender;
                                        const isLastInGroup = !nextMsg || nextMsg.sender !== msg.sender;

                                        return (
                                            <React.Fragment key={msg.id || idx}>
                                                {/* Unread Divider (Compact) */}
                                                {isFirstUnread && showUnreadDivider && (
                                                    <UnreadDivider ref={unreadRef} count={unreadCount} compact />
                                                )}

                                                <MessageBubble
                                                    message={msg}
                                                    senderName={msg.sender}
                                                    isAgent={isMe} // Right side (Blue) for Me
                                                    senderType={isMe ? 'agent' : 'peer'} // 'agent' shows 'You', others show senderName
                                                    isFirstInGroup={isFirstInGroup}
                                                    isLastInGroup={isLastInGroup}
                                                    currentUser={user} // Pass current user for mention highlighting
                                                    compact={true} // Use smaller bubbles for Broadcast
                                                    maxWidth="max-w-[80%]" // Tunable width as requested
                                                />
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        {/* Empty State */}
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60 mt-10">
                                <MessageSquare className="h-10 w-10 mb-2 opacity-50" />
                                <p className="text-xs">No active broadcasts</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
                    <div className="bg-slate-800 rounded-lg px-3 py-2 flex flex-col gap-2">
                        {/* Lexical MentionEditor */}
                        <MentionEditor
                            agents={onlineAgents}
                            currentUserName={user?.name}
                            placeholder="Broadcast to team..., @ to mention"
                            onTextChange={setInputValue}
                            editorRef={editorRef}
                            shouldClear={shouldClearEditor}
                            onCleared={() => setShouldClearEditor(false)}
                            onSubmit={handleSend}
                            maxLength={MAX_MESSAGE_LENGTH}
                        />

                        {/* Counter + Send Row */}
                        <div className="flex items-center justify-end gap-2">
                            {/* Character Counter */}
                            {charCount > 0 && (
                                <span className={`text-[10px] font-medium tabular-nums ${charCount >= MAX_MESSAGE_LENGTH
                                    ? 'text-red-400'
                                    : charCount >= MAX_MESSAGE_LENGTH * 0.9
                                        ? 'text-amber-400'
                                        : 'text-slate-500'
                                    }`}>
                                    {charCount}/{MAX_MESSAGE_LENGTH}
                                </span>
                            )}

                            {/* Send Button */}
                            <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleSend}
                                        disabled={!inputValue.trim()}
                                        className={`h-8 w-8 rounded-lg transition-colors shrink-0 cursor-pointer ${!inputValue.trim()
                                            ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
                                            : 'text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50'
                                            }`}
                                    >
                                        <Send className="h-5 w-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent className="z-100 text-[10px] px-2 py-1 h-auto min-h-0 bg-slate-900 border-slate-700 text-slate-200">
                                    Send
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>
        </Card >
    );
};

export default AgentBroadcastChat;

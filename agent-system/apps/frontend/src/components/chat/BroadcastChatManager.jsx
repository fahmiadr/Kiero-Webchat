import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Radio } from 'lucide-react';
import { socket } from '@/lib/socket';
import useAuthStore from '@/stores/useAuthStore';
import AgentBroadcastChat from './AgentBroadcastChat';

const BroadcastChatManager = () => {
    const user = useAuthStore(state => state.user);
    const [isOpen, setIsOpen] = useState(false);

    // State for Broadcast Logic
    const [unreadCount, setUnreadCount] = useState(0);
    const [hasMention, setHasMention] = useState(false);
    const [onlineAgents, setOnlineAgents] = useState([]);
    const [messages, setMessages] = useState([]); // Lifted state for persistence
    const [firstUnreadIndex, setFirstUnreadIndex] = useState(-1); // Track first unread message index

    // FAB Position State (Draggable)
    const [position, setPosition] = useState({ bottom: 20, right: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef({ startX: 0, startY: 0, startRight: 0, startBottom: 0 });

    useEffect(() => {
        if (!user) return;

        // Register Online
        socket.emit('agent:online', { agentName: user.name, agentId: user.id });

        const handleBroadcast = (payload) => {
            // Always append message to history (persistence)
            setMessages(prev => [...prev, payload]);

            if (!isOpen) {
                setUnreadCount(prev => prev + 1);
                if (payload.content.includes(`@${user.name}`)) {
                    setHasMention(true);
                }
            }
        };

        const handleAgentsUpdate = (agents) => {
            setOnlineAgents(agents);
        };

        socket.on('agent:broadcast_message', handleBroadcast);
        socket.on('agents:update', handleAgentsUpdate);

        return () => {
            socket.off('agent:broadcast_message', handleBroadcast);
            socket.off('agents:update', handleAgentsUpdate);
        };
    }, [user, isOpen]);

    // Drag Logic
    const handleMouseDown = (e) => {
        if (e.button !== 0) return; // Only left click

        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startRight: position.right,
            startBottom: position.bottom,
            hasMoved: false
        };
        setIsDragging(true);
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;

            const dx = dragRef.current.startX - e.clientX;
            const dy = dragRef.current.startY - e.clientY;

            // Threshold check
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                dragRef.current.hasMoved = true;
            }

            if (dragRef.current.hasMoved) {
                let newRight = dragRef.current.startRight + dx;
                let newBottom = dragRef.current.startBottom + dy;
                const FAB_SIZE = 60;
                const maxRight = window.innerWidth - FAB_SIZE;
                const maxBottom = window.innerHeight - FAB_SIZE;
                newRight = Math.max(10, Math.min(newRight, maxRight));
                newBottom = Math.max(10, Math.min(newBottom, maxBottom));
                setPosition({ right: newRight, bottom: newBottom });
            }
        };

        const handleMouseUp = (e) => {
            if (isDragging) {
                setIsDragging(false);
                if (!dragRef.current.hasMoved) {
                    if (!isOpen) {
                        // Opening the chat: Calculate index NOW to ensure sync state for child
                        if (unreadCount > 0) {
                            setFirstUnreadIndex(messages.length - unreadCount);
                        } else {
                            setFirstUnreadIndex(-1);
                        }
                        setUnreadCount(0);
                        setHasMention(false);
                    }
                    setIsOpen(prev => !prev);
                }
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const [showOnlinePanel, setShowOnlinePanel] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            const FAB_SIZE = 60;
            setPosition(prev => ({
                right: Math.max(10, Math.min(prev.right, window.innerWidth - FAB_SIZE)),
                bottom: Math.max(10, Math.min(prev.bottom, window.innerHeight - FAB_SIZE))
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Robust Positioning Logic
    const getPanelStyle = () => {
        const FAB_SIZE = 56;
        const MARGIN = 16;
        const SCREEN_MARGIN = 10;
        const PANEL_WIDTH = 320;
        const PANEL_HEIGHT = 400;
        const fabRightDist = position.right;
        const fabBottomDist = position.bottom;
        const fabLeftAbs = window.innerWidth - fabRightDist - FAB_SIZE;
        const fabRightAbs = window.innerWidth - fabRightDist;
        const preferenceLeft = fabLeftAbs > (window.innerWidth - fabRightAbs);

        let style = {};
        if (preferenceLeft) {
            const proposedRightStyle = (window.innerWidth - fabLeftAbs) + MARGIN;
            const apparentLeft = window.innerWidth - proposedRightStyle - PANEL_WIDTH;
            if (apparentLeft < SCREEN_MARGIN) {
                style.left = SCREEN_MARGIN;
            } else {
                style.right = proposedRightStyle;
            }
        } else {
            const proposedLeftStyle = fabRightAbs + MARGIN;
            if (proposedLeftStyle + PANEL_WIDTH > window.innerWidth - SCREEN_MARGIN) {
                style.left = window.innerWidth - SCREEN_MARGIN - PANEL_WIDTH;
            } else {
                style.left = proposedLeftStyle;
            }
        }

        const proposedBottomStyle = fabBottomDist;
        const apparentTop = window.innerHeight - proposedBottomStyle - PANEL_HEIGHT;
        if (apparentTop < SCREEN_MARGIN) {
            style.top = SCREEN_MARGIN;
        } else {
            style.bottom = proposedBottomStyle;
        }
        return style;
    };

    const panelStyle = getPanelStyle();

    return (
        <>
            <div
                className="fixed z-[60] cursor-move touch-none"
                style={{ right: position.right, bottom: position.bottom }}
                onMouseDown={handleMouseDown}
            >
                <div className="relative group pointer-events-none">
                    {/* Glow effect behind FAB */}
                    <div className={`absolute inset-0 rounded-full blur-xl transition-opacity ${isOpen ? 'bg-blue-400/50 opacity-100' : 'bg-blue-500/30 opacity-100 group-hover:bg-blue-400/40'}`} />

                    <Button
                        size="icon"
                        className={`relative h-14 w-14 rounded-full shadow-2xl shadow-black/50 transition-all duration-200 active:scale-95 pointer-events-auto border-0 ${isOpen
                            ? 'bg-gradient-to-br from-blue-400 to-blue-600 hover:from-blue-300 hover:to-blue-500 ring-2 ring-blue-300/50'
                            : 'bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 ring-1 ring-blue-500/30'
                            }`}
                    >
                        <Radio style={{ width: 24, height: 24 }} className={`text-white drop-shadow-lg ${isOpen ? 'animate-pulse' : ''}`} />
                    </Button>
                    {unreadCount > 0 && (
                        <span className={`absolute -top-1 -right-1 flex w-5 h-5 items-center justify-center rounded-full font-bold text-white ring-2 ring-slate-950 shadow-lg animate-bounce ${hasMention ? 'bg-blue-500' : 'bg-red-500'} ${unreadCount > 99 ? 'text-[8px]' : unreadCount > 9 ? 'text-[9px]' : 'text-[10px]'}`}>
                            {hasMention ? '@' : (unreadCount > 99 ? '99+' : unreadCount)}
                        </span>
                    )}
                </div>
            </div>

            {isOpen && (
                <div className="fixed z-[60]" style={panelStyle}>
                    <AgentBroadcastChat
                        isOpen={true}
                        onClose={() => setIsOpen(false)}
                        onlineAgents={onlineAgents}
                        showOnlinePanel={showOnlinePanel}
                        setShowOnlinePanel={setShowOnlinePanel}
                        messages={messages}
                        firstUnreadIndex={firstUnreadIndex}
                    />
                </div>
            )}
        </>
    );
};

export default BroadcastChatManager;

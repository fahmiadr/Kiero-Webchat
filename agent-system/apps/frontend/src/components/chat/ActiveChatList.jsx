import React, { memo } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Globe } from 'lucide-react';
import { SiWhatsapp, SiTelegram, SiInstagram, SiFacebook } from 'react-icons/si';
import { getAvatarColor, getInitials } from '@/utils/avatar';
import { formatChatTime } from '@/utils/formatUtils';

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Memoized Chat Item Component
const ActiveChatItem = memo(({ chat, isActive, onSelect }) => {
    const isUnread = chat.unread > 0;

    return (
        <div
            onClick={() => onSelect(chat.id)}
            className={`group flex items-center gap-3 p-3 cursor-pointer transition-all border-l-4 ${isActive
                ? 'bg-slate-800 border-l-blue-500'
                : 'border-l-transparent hover:bg-slate-800/50'
                }`}
        >
            {/* Avatar with User Icon */}
            <div className="relative">
                <Avatar className="h-10 w-10">
                    <AvatarFallback className={`${getAvatarColor(chat.name)} text-white font-semibold text-sm`}>
                        {getInitials(chat.name)}
                    </AvatarFallback>
                </Avatar>
                {isUnread && (
                    <div className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-red-500 border-2 border-slate-900 rounded-full flex items-center justify-center z-10">
                        <span className={`font-bold text-white leading-none ${chat.unread > 99 ? 'text-[8px]' : chat.unread > 9 ? 'text-[9px]' : 'text-[10px]'}`}>
                            {chat.unread > 99 ? '99+' : chat.unread}
                        </span>
                    </div>
                )}
            </div>

            {/* Chat Info */}
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                    <span className={`font-medium truncate text-sm ${isActive ? 'text-white' : 'text-slate-200'}`}>
                        {chat.name || 'Visitor'}
                    </span>

                    {/* Viewer Indicators & Status */}
                    <div className="flex items-center gap-2">
                        {/* Status Badge */}
                        <Badge variant={
                            chat.waitingAgent ? 'warning' :
                                (chat.agentHandle ? 'success' : 'secondary')
                        }>
                            {chat.waitingAgent ? 'Waiting' :
                                (chat.agentHandle ? 'Handling' : 'Unclosed')}
                        </Badge>
                    </div>
                </div>

                {/* Customer ID sub-label */}
                <div className="text-xs text-slate-400 truncate mb-0.5">
                    {chat.email || 'visitor@email.com'}
                </div>

                <div className="flex justify-between items-center text-xs text-slate-500 h-6">
                    <span className="flex items-center gap-1">
                        {/* Channel Icon - Official Brand Icons */}
                        {chat.channel?.toLowerCase() === 'whatsapp' && <SiWhatsapp className="w-3 h-3 text-green-500" />}
                        {chat.channel?.toLowerCase() === 'telegram' && <SiTelegram className="w-3 h-3 text-sky-400" />}
                        {chat.channel?.toLowerCase() === 'instagram' && <SiInstagram className="w-3 h-3 text-pink-500" />}
                        {chat.channel?.toLowerCase() === 'facebook' && <SiFacebook className="w-3 h-3 text-blue-500" />}
                        {(!chat.channel || chat.channel?.toLowerCase() === 'webchat' || chat.channel?.toLowerCase() === 'web') && <Globe className="w-3 h-3 text-slate-400" />}
                        Started: {formatChatTime(chat.startTime)}
                    </span>

                    {/* Viewers (Moved to bottom) */}
                    {chat.viewers && chat.viewers.length > 0 && (
                        <div className="flex -space-x-2">
                            {chat.viewers.slice(0, 3).map((viewer, idx) => (
                                <Tooltip key={idx} delayDuration={500}>
                                    <TooltipTrigger asChild>
                                        <div className="relative group/viewer cursor-help">
                                            <Avatar className="h-5 w-5 border border-slate-900 ring-1 ring-slate-800">
                                                <AvatarFallback className={`text-[9px] ${getAvatarColor(viewer.name)} text-white font-bold`}>
                                                    {getInitials(viewer.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="top"
                                        className="bg-slate-800 text-white text-[10px] border-slate-700 px-2 py-1 z-[100]"
                                    >
                                        <p>{viewer.name}</p>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                            {chat.viewers.length > 3 && (
                                <div className="h-5 w-5 rounded-full bg-slate-700 border border-slate-900 flex items-center justify-center text-[8px] text-white">
                                    +{chat.viewers.length - 3}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

const ActiveChatList = ({ chats, activeChatId, onSelectChat }) => {

    return (
        <Card className="w-80 flex flex-col bg-slate-900 rounded-md border-2 border-slate-800 overflow-hidden shadow-sm p-0">
            <div className="p-4 space-y-4 border-b-2 border-slate-800">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-lg text-slate-100">Active chat</h2>
                    <div className="flex gap-2">

                    </div>
                </div>
            </div>

            <ScrollArea className="flex-1 h-full">
                <div className="py-2 space-y-0">
                    {chats.map((chat) => (
                        <ActiveChatItem
                            key={chat.id}
                            chat={chat}
                            isActive={activeChatId === chat.id}
                            onSelect={onSelectChat}
                        />
                    ))}

                    {chats.length === 0 && (
                        <div className="mt-4 p-6 rounded-xl border border-dashed border-slate-800 text-center mx-2">
                            <p className="text-sm text-slate-500">No active chats</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </Card>
    );
};

export default ActiveChatList;

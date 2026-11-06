import { useState, useCallback, memo } from 'react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Trash2, Shield, Key, Palette, Bot } from "lucide-react";

/**
 * @param {Object} props
 * @param {Object} props.client
 * @param {Function} props.onEdit
 * @param {Function} props.onRotateKey
 * @param {Function} props.onRotateSecret
 * @param {Function} props.onDelete
 */
const ClientActions = memo(({ client, onEdit, onEditBotConfig, onRotateKey, onRotateSecret, onDelete, onNavigateToTheme }) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleAction = useCallback((callback) => {
        setIsOpen(false);

        // Wait for popover close animation before firing callback
        setTimeout(() => {
            callback();
        }, 150);
    }, []);

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800 data-[state=open]:bg-slate-800 cursor-pointer">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-[180px] p-1 bg-slate-900 border-slate-800 text-slate-200 z-[100]"
            >
                <p className="px-2 py-1.5 text-xs text-slate-400 uppercase tracking-wider font-medium">Actions</p>
                <button
                    onClick={() => handleAction(() => onEdit(client))}
                    className="flex items-center w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-slate-800 transition-colors text-left"
                >
                    <Edit className="mr-2 h-3.5 w-3.5 text-blue-400" />
                    <span>Edit Client</span>
                </button>
                <div className="h-px bg-slate-800 my-1" />
                <button
                    onClick={() => handleAction(() => onEditBotConfig(client))}
                    className="flex items-center w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-slate-800 transition-colors text-left"
                >
                    <Bot className="mr-2 h-3.5 w-3.5 text-blue-400" />
                    <span>Bot Configuration</span>
                </button>
                <div className="h-px bg-slate-800 my-1" />
                <button
                    onClick={() => handleAction(() => onNavigateToTheme(client.clientId))}
                    className="flex items-center w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-slate-800 transition-colors text-left"
                >
                    <Palette className="mr-2 h-3.5 w-3.5 text-emerald-400" />
                    <span>Theme Builder</span>
                </button>
                <div className="h-px bg-slate-800 my-1" />
                <button
                    onClick={() => handleAction(() => onRotateKey(client.id))}
                    className="flex items-center w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-slate-800 transition-colors text-left"
                >
                    <Key className="mr-2 h-3.5 w-3.5 text-amber-500" />
                    <span>Rotate API Key</span>
                </button>
                <button
                    onClick={() => handleAction(() => onRotateSecret(client.id))}
                    className="flex items-center w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-slate-800 transition-colors text-left"
                >
                    <Shield className="mr-2 h-3.5 w-3.5 text-amber-500" />
                    <span>Rotate Secret</span>
                </button>
                <div className="h-px bg-slate-800 my-1" />
                <button
                    onClick={() => handleAction(() => onDelete(client.id))}
                    className="flex items-center w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors text-left"
                >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    <span>Delete Client</span>
                </button>
            </PopoverContent>
        </Popover>
    );
});

export default ClientActions;

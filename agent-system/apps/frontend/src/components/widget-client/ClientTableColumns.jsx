import { memo } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown, Globe } from "lucide-react";
import { copyToClipboard } from '@/utils/clipboard';
import { formatDateTime } from '@/utils/formatUtils';
import ClientActions from './ClientActions';

const SortableHeader = memo(({ column, title, isSorted, isHiddenOnMobile = false }) => {
    const SortIcon = () => {
        if (isSorted === "asc") return <ArrowUp className="ml-2 h-3.5 w-3.5 text-blue-400" />;
        if (isSorted === "desc") return <ArrowDown className="ml-2 h-3.5 w-3.5 text-blue-400" />;
        return <ArrowUpDown className={`ml-2 h-3 w-3 opacity-50 ${isHiddenOnMobile ? "hidden sm:block" : ""}`} />;
    };

    return (
        <Button
            variant="ghost"
            onClick={() => column.toggleSorting(isSorted === "asc")}
            className="h-8 px-2 text-xs hover:bg-transparent hover:text-white"
        >
            {title}
            <SortIcon />
        </Button>
    );
});

/**
 * @param {Object} actions - Handlers passed from parent
 * @returns {Array} - Column definitions
 */
const StatusCell = memo(({ row }) => {
    const isActive = row.getValue("active");
    return (
        <div className="pl-2">
            <Badge
                variant={isActive ? "default" : "destructive"}
                className={`font-medium border ${isActive
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                    }`}
            >
                {isActive ? "Active" : "Inactive"}
            </Badge>
        </div>
    );
});

const DetailsCell = memo(({ row }) => {
    const name = row.getValue("name");
    const id = row.original.clientId;
    return (
        <div className="flex flex-col gap-1 pl-2">
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="font-semibold text-slate-100 truncate">{name}</span>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="bg-slate-900 border-slate-700 text-slate-200 text-xs break-all max-w-[300px]">
                    {name}
                </TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ID</span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge
                            variant="outline"
                            className="border-slate-700 text-slate-300 font-mono font-normal text-[10px] px-1.5 py-0 tracking-tight hover:bg-slate-800 cursor-pointer hover:text-slate-200 transition-colors select-none"
                            onClick={() => copyToClipboard(id, 'Client ID')}
                        >
                            {id}
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-slate-900 border-slate-700 text-slate-200 text-xs">Click to copy</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
});

const OriginsCell = memo(({ row }) => {
    const origins = row.getValue("allowedOrigins") || [];
    if (origins.length === 0) {
        return <span className="text-slate-400 text-xs italic pl-2">No restrictions (wildcard)</span>;
    }
    return (
        <div className="flex flex-wrap gap-1.5 max-w-[250px] pl-2">
            {origins.slice(0, 2).map((origin, index) => (
                <Tooltip key={index}>
                    <TooltipTrigger asChild>
                        <Badge
                            variant="secondary"
                            className="bg-slate-800 text-slate-300 hover:bg-slate-700 font-mono text-[10px] h-5 px-1.5 font-normal border border-slate-700 cursor-help"
                        >
                            <span className="truncate max-w-[120px]">{origin}</span>
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="bg-slate-900 border-slate-700 text-slate-200 text-xs">
                        {origin}
                    </TooltipContent>
                </Tooltip>
            ))}
            {origins.length > 2 && (
                <Badge variant="secondary" className="bg-slate-800 text-slate-400 hover:bg-slate-700 font-mono text-[10px] h-5 px-1.5 font-normal border border-slate-700">
                    +{origins.length - 2} more
                </Badge>
            )}
        </div>
    );
});

const WebhookCell = memo(({ row }) => {
    const url = row.getValue("webhookUrl");
    if (!url) return <span className="text-slate-400 text-xs italic pl-2">Not configured</span>;
    return (
        <div className="pl-2">
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 max-w-[200px] cursor-help">
                        <div className="p-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                            <Globe className="w-3 h-3" />
                        </div>
                        <span className="truncate text-slate-300 font-mono text-xs">
                            {url}
                        </span>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-slate-900 border-slate-700 text-slate-200 text-xs break-all max-w-[300px]">
                    {url}
                </TooltipContent>
            </Tooltip>
        </div>
    );
});

const TimestampCell = memo(({ row }) => {
    const updatedAt = row.getValue("updatedAt");
    const createdAt = row.original.createdAt;

    return (
        <div className="flex flex-col gap-0.5 pl-2">
            <div className="text-xs text-slate-200 font-mono">
                <span className="text-slate-400 mr-1.5">Updated:</span>
                {formatDateTime(updatedAt)}
            </div>
            <div className="text-[10px] text-slate-300 font-mono">
                <span className="text-slate-500 mr-1.5">Created:</span>
                {formatDateTime(createdAt)}
            </div>
        </div>
    );
});

const ActionCell = memo(({ row, actions }) => {
    const client = row.original;
    return (
        <div className="text-right">
            <ClientActions
                client={client}
                onEdit={actions.onEdit}
                onEditBotConfig={actions.onEditBotConfig}
                onRotateKey={actions.onRotateKey}
                onRotateSecret={actions.onRotateSecret}
                onDelete={actions.onDelete}
                onNavigateToTheme={actions.onNavigateToTheme}
            />
        </div>
    );
});

/**
 * @param {Object} actions - Handlers passed from parent
 * @returns {Array} - Column definitions
 */
const ClientTableColumns = (actions) => [
    {
        accessorKey: "active",
        meta: { title: "Status" },
        size: 100,
        header: ({ column }) => <SortableHeader column={column} title="Status" isSorted={column.getIsSorted()} />,
        cell: (props) => <StatusCell {...props} />,
    },
    {
        accessorKey: "name",
        meta: { title: "Client Details" },
        size: 250,
        header: ({ column }) => <SortableHeader column={column} title="Client Details" isSorted={column.getIsSorted()} />,
        cell: (props) => <DetailsCell {...props} />,
    },
    {
        accessorKey: "allowedOrigins",
        meta: { title: "Allowed Origins" },
        size: 250,
        header: () => (
            <div className="h-8 px-2 text-xs flex items-center font-medium normal-case">
                Allowed Origins
            </div>
        ),
        cell: (props) => <OriginsCell {...props} />,
    },
    {
        accessorKey: "webhookUrl",
        meta: { title: "Webhook URL" },
        size: 250,
        header: () => (
            <div className="h-8 px-2 text-xs flex items-center font-medium normal-case">
                Webhook URL
            </div>
        ),
        cell: (props) => <WebhookCell {...props} />,
    },
    {
        accessorKey: "updatedAt",
        meta: { title: "Timestamps" },
        size: 200,
        header: ({ column }) => <SortableHeader column={column} title="Timestamps" isSorted={column.getIsSorted()} isHiddenOnMobile />,
        cell: (props) => <TimestampCell {...props} />,
    },
    {
        id: "actions",
        meta: { title: "Actions" },
        size: 100,
        header: () => (
            <div className="h-8 px-2 text-xs flex items-center justify-end font-medium normal-case">
                Actions
            </div>
        ),
        cell: (props) => <ActionCell {...props} actions={actions} />,
    },
];

export default ClientTableColumns;
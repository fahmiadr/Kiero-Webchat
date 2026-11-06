/**
 * Audit Log Constants
 * 
 * Shared constants for audit log components: icons, styles, and colors.
 * Used by LogRowExpandable, StatsGrid, ActivityTimeline, etc.
 */
import {
    Info,
    AlertTriangle,
    AlertCircle,
    XCircle
} from 'lucide-react';

// === Level Icons ===
export const levelIcons = {
    INFO: Info,
    WARN: AlertTriangle,
    ERROR: AlertCircle,
    CRITICAL: XCircle
};

// === Level Styles (Badge/Text styling) ===
export const levelStyles = {
    INFO: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    WARN: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    ERROR: 'bg-red-500/20 text-red-400 border-red-500/30',
    CRITICAL: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30'
};

// === Level Colors (for charts, cards, etc.) ===
export const levelColors = {
    INFO: {
        text: 'text-blue-400',
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/30',
        fill: '#3b82f6',
        name: 'blue'
    },
    WARN: {
        text: 'text-amber-400',
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/30',
        fill: '#f59e0b',
        name: 'amber'
    },
    ERROR: {
        text: 'text-red-400',
        bg: 'bg-red-500/20',
        border: 'border-red-500/30',
        fill: '#ef4444',
        name: 'red'
    },
    CRITICAL: {
        text: 'text-fuchsia-400',
        bg: 'bg-fuchsia-500/20',
        border: 'border-fuchsia-500/30',
        fill: '#d946ef',
        name: 'fuchsia'
    }
};

// === Source Styles ===
export const sourceStyles = {
    system: 'bg-slate-600/30 text-slate-300 border-slate-500/30',
    agent: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    widget: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    external: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    queue: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
};

// === Source Colors ===
export const sourceColors = {
    system: { text: 'text-slate-300', fill: '#94a3b8' },
    agent: { text: 'text-purple-400', fill: '#a855f7' },
    widget: { text: 'text-emerald-400', fill: '#10b981' },
    external: { text: 'text-cyan-400', fill: '#22d3ee' },
    queue: { text: 'text-orange-400', fill: '#f97316' }
};

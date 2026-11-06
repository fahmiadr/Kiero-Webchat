/**
 * Generate a consistent hash from a string
 * @param {string} str - input string
 * @returns {number} - hash value
 */
const hashCode = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash | 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

// Explicitly define themes to ensure Tailwind scans the class names
// DARK MODE VARIANTS for Agent Dashboard
const ROLE_THEMES = {
    slate: {
        bubble: 'bg-slate-800 text-slate-200 border-2 border-slate-700',
        text: 'text-slate-200',
        indicator: {
            timestamp: 'text-slate-400',
            sending: 'text-slate-500',
            pending: 'text-slate-500',
            sent: 'text-slate-400',
            delivered: 'text-slate-400',
            read: 'text-blue-400'
        },
        badge: 'bg-slate-900 text-slate-300 border-slate-700',
        link: 'text-blue-400 decoration-blue-500/50',
        attachment: {
            container: 'bg-slate-900/50 border-slate-700/50',
            icon: 'text-slate-400',
            text: 'text-slate-200',
            hover: 'hover:bg-slate-700/50',
            meta: 'text-slate-400',
            ready: 'text-emerald-400',
            player: {
                bg: 'bg-slate-900/30',
                button: 'bg-slate-800 hover:bg-slate-700 text-slate-200',
                track: 'bg-slate-700',
                fill: 'bg-slate-400',
                thumb: 'bg-white',
                text: 'text-slate-400'
            }
        }
    },
    gray: {
        bubble: 'bg-gray-800 text-gray-200 border-2 border-gray-700',
        text: 'text-gray-200',
        indicator: {
            timestamp: 'text-gray-400',
            sending: 'text-gray-500',
            pending: 'text-gray-500',
            sent: 'text-gray-400',
            delivered: 'text-gray-400',
            read: 'text-blue-400'
        },
        badge: 'bg-gray-900 text-gray-300 border-gray-700',
        link: 'text-blue-400 decoration-blue-500/50',
        attachment: {
            container: 'bg-gray-900/50 border-gray-700/50',
            icon: 'text-gray-400',
            text: 'text-gray-200',
            hover: 'hover:bg-gray-700/50',
            meta: 'text-gray-400',
            ready: 'text-emerald-400',
            player: {
                bg: 'bg-gray-900/30',
                button: 'bg-gray-800 hover:bg-gray-700 text-gray-200',
                track: 'bg-gray-700',
                fill: 'bg-gray-400',
                thumb: 'bg-white',
                text: 'text-gray-400'
            }
        }
    },
    zinc: {
        bubble: 'bg-zinc-800 text-zinc-200 border-2 border-zinc-700',
        text: 'text-zinc-200',
        indicator: {
            timestamp: 'text-zinc-400',
            sending: 'text-zinc-500',
            pending: 'text-zinc-500',
            sent: 'text-zinc-400',
            delivered: 'text-zinc-400',
            read: 'text-blue-400'
        },
        badge: 'bg-zinc-900 text-zinc-300 border-zinc-700',
        link: 'text-blue-400 decoration-blue-500/50',
        attachment: {
            container: 'bg-zinc-900/50 border-zinc-700/50',
            icon: 'text-zinc-400',
            text: 'text-zinc-200',
            hover: 'hover:bg-zinc-700/50',
            meta: 'text-zinc-400',
            ready: 'text-emerald-400',
            player: {
                bg: 'bg-zinc-900/30',
                button: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200',
                track: 'bg-zinc-700',
                fill: 'bg-zinc-400',
                thumb: 'bg-white',
                text: 'text-zinc-400'
            }
        }
    },
    neutral: {
        bubble: 'bg-neutral-800 text-neutral-200 border-2 border-neutral-700',
        text: 'text-neutral-200',
        indicator: {
            timestamp: 'text-neutral-400',
            sending: 'text-neutral-500',
            pending: 'text-neutral-500',
            sent: 'text-neutral-400',
            delivered: 'text-neutral-400',
            read: 'text-blue-400'
        },
        badge: 'bg-neutral-900 text-neutral-300 border-neutral-700',
        link: 'text-blue-400 decoration-blue-500/50',
        attachment: {
            container: 'bg-neutral-900/50 border-neutral-700/50',
            icon: 'text-neutral-400',
            text: 'text-neutral-200',
            hover: 'hover:bg-neutral-700/50',
            meta: 'text-neutral-400',
            ready: 'text-emerald-400',
            player: {
                bg: 'bg-neutral-900/30',
                button: 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200',
                track: 'bg-neutral-700',
                fill: 'bg-neutral-400',
                thumb: 'bg-white',
                text: 'text-neutral-400'
            }
        }
    },
    stone: {
        bubble: 'bg-stone-800 text-stone-200 border-2 border-stone-700',
        text: 'text-stone-200',
        indicator: {
            timestamp: 'text-stone-400',
            sending: 'text-stone-500',
            pending: 'text-stone-500',
            sent: 'text-stone-400',
            delivered: 'text-stone-400',
            read: 'text-blue-400'
        },
        badge: 'bg-stone-900 text-stone-300 border-stone-700',
        link: 'text-blue-400 decoration-blue-500/50',
        attachment: {
            container: 'bg-stone-900/50 border-stone-700/50',
            icon: 'text-stone-400',
            text: 'text-stone-200',
            hover: 'hover:bg-stone-700/50',
            meta: 'text-stone-400',
            ready: 'text-emerald-400',
            player: {
                bg: 'bg-stone-900/30',
                button: 'bg-stone-800 hover:bg-stone-700 text-stone-200',
                track: 'bg-stone-700',
                fill: 'bg-stone-400',
                thumb: 'bg-white',
                text: 'text-stone-400'
            }
        }
    },
    red: {
        bubble: 'bg-red-900 text-red-50 border-2 border-red-800',
        text: 'text-red-50',
        indicator: {
            timestamp: 'text-red-200',
            sending: 'text-red-300',
            pending: 'text-red-300',
            sent: 'text-red-200',
            delivered: 'text-red-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-red-950 text-red-200 border-red-800',
        link: 'text-white decoration-red-300',
        attachment: {
            container: 'bg-red-950/50 border-red-800/50',
            icon: 'text-red-300',
            text: 'text-red-100',
            hover: 'hover:bg-red-900/50',
            meta: 'text-red-300',
            ready: 'text-white',
            player: {
                bg: 'bg-red-950/30',
                button: 'bg-red-800 hover:bg-red-700 text-red-100',
                track: 'bg-red-900',
                fill: 'bg-red-400',
                thumb: 'bg-white',
                text: 'text-red-200'
            }
        }
    },
    orange: {
        bubble: 'bg-orange-900 text-orange-50 border-2 border-orange-800',
        text: 'text-orange-50',
        indicator: {
            timestamp: 'text-orange-200',
            sending: 'text-orange-300',
            pending: 'text-orange-300',
            sent: 'text-orange-200',
            delivered: 'text-orange-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-orange-950 text-orange-200 border-orange-800',
        link: 'text-white decoration-orange-300',
        attachment: {
            container: 'bg-orange-950/50 border-orange-800/50',
            icon: 'text-orange-300',
            text: 'text-orange-100',
            hover: 'hover:bg-orange-900/50',
            meta: 'text-orange-300',
            ready: 'text-white',
            player: {
                bg: 'bg-orange-950/30',
                button: 'bg-orange-800 hover:bg-orange-700 text-orange-100',
                track: 'bg-orange-900',
                fill: 'bg-orange-400',
                thumb: 'bg-white',
                text: 'text-orange-200'
            }
        }
    },
    amber: {
        bubble: 'bg-amber-900 text-amber-50 border-2 border-amber-800',
        text: 'text-amber-50',
        indicator: {
            timestamp: 'text-amber-200',
            sending: 'text-amber-300',
            pending: 'text-amber-300',
            sent: 'text-amber-200',
            delivered: 'text-amber-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-amber-950 text-amber-200 border-amber-800',
        link: 'text-white decoration-amber-300',
        attachment: {
            container: 'bg-amber-950/50 border-amber-800/50',
            icon: 'text-amber-300',
            text: 'text-amber-100',
            hover: 'hover:bg-amber-900/50',
            meta: 'text-amber-300',
            ready: 'text-white',
            player: {
                bg: 'bg-amber-950/30',
                button: 'bg-amber-800 hover:bg-amber-700 text-amber-100',
                track: 'bg-amber-900',
                fill: 'bg-amber-400',
                thumb: 'bg-white',
                text: 'text-amber-200'
            }
        }
    },
    green: {
        bubble: 'bg-green-900 text-green-50 border-2 border-green-800',
        text: 'text-green-50',
        indicator: {
            timestamp: 'text-green-200',
            sending: 'text-green-300',
            pending: 'text-green-300',
            sent: 'text-green-200',
            delivered: 'text-green-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-green-950 text-green-200 border-green-800',
        link: 'text-white decoration-green-300',
        attachment: {
            container: 'bg-green-950/50 border-green-800/50',
            icon: 'text-green-300',
            text: 'text-green-100',
            hover: 'hover:bg-green-900/50',
            meta: 'text-green-300',
            ready: 'text-white',
            player: {
                bg: 'bg-green-950/30',
                button: 'bg-green-800 hover:bg-green-700 text-green-100',
                track: 'bg-green-900',
                fill: 'bg-green-400',
                thumb: 'bg-white',
                text: 'text-green-200'
            }
        }
    },
    emerald: {
        bubble: 'bg-emerald-900 text-emerald-50 border-2 border-emerald-800',
        text: 'text-emerald-50',
        indicator: {
            timestamp: 'text-emerald-200',
            sending: 'text-emerald-300',
            pending: 'text-emerald-300',
            sent: 'text-emerald-200',
            delivered: 'text-emerald-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-emerald-950 text-emerald-200 border-emerald-800',
        link: 'text-white decoration-emerald-300',
        attachment: {
            container: 'bg-emerald-950/50 border-emerald-800/50',
            icon: 'text-emerald-300',
            text: 'text-emerald-100',
            hover: 'hover:bg-emerald-900/50',
            meta: 'text-emerald-300',
            ready: 'text-white',
            player: {
                bg: 'bg-emerald-950/30',
                button: 'bg-emerald-800 hover:bg-emerald-700 text-emerald-100',
                track: 'bg-emerald-900',
                fill: 'bg-emerald-400',
                thumb: 'bg-white',
                text: 'text-emerald-200'
            }
        }
    },
    teal: {
        bubble: 'bg-teal-900 text-teal-50 border-2 border-teal-800',
        text: 'text-teal-50',
        indicator: {
            timestamp: 'text-teal-200',
            sending: 'text-teal-300',
            pending: 'text-teal-300',
            sent: 'text-teal-200',
            delivered: 'text-teal-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-teal-950 text-teal-200 border-teal-800',
        link: 'text-white decoration-teal-300',
        attachment: {
            container: 'bg-teal-950/50 border-teal-800/50',
            icon: 'text-teal-300',
            text: 'text-teal-100',
            hover: 'hover:bg-teal-900/50',
            meta: 'text-teal-300',
            ready: 'text-white',
            player: {
                bg: 'bg-teal-950/30',
                button: 'bg-teal-800 hover:bg-teal-700 text-teal-100',
                track: 'bg-teal-900',
                fill: 'bg-teal-400',
                thumb: 'bg-white',
                text: 'text-teal-200'
            }
        }
    },
    cyan: {
        bubble: 'bg-cyan-900 text-cyan-50 border-2 border-cyan-800',
        text: 'text-cyan-50',
        indicator: {
            timestamp: 'text-cyan-200',
            sending: 'text-cyan-300',
            pending: 'text-cyan-300',
            sent: 'text-cyan-200',
            delivered: 'text-cyan-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-cyan-950 text-cyan-200 border-cyan-800',
        link: 'text-white decoration-cyan-300',
        attachment: {
            container: 'bg-cyan-950/50 border-cyan-800/50',
            icon: 'text-cyan-300',
            text: 'text-cyan-100',
            hover: 'hover:bg-cyan-900/50',
            meta: 'text-cyan-300',
            ready: 'text-white',
            player: {
                bg: 'bg-cyan-950/30',
                button: 'bg-cyan-800 hover:bg-cyan-700 text-cyan-100',
                track: 'bg-cyan-900',
                fill: 'bg-cyan-400',
                thumb: 'bg-white',
                text: 'text-cyan-200'
            }
        }
    },
    sky: {
        bubble: 'bg-sky-900 text-sky-50 border-2 border-sky-800',
        text: 'text-sky-50',
        indicator: {
            timestamp: 'text-sky-200',
            sending: 'text-sky-300',
            pending: 'text-sky-300',
            sent: 'text-sky-200',
            delivered: 'text-sky-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-sky-950 text-sky-200 border-sky-800',
        link: 'text-white decoration-sky-300',
        attachment: {
            container: 'bg-sky-950/50 border-sky-800/50',
            icon: 'text-sky-300',
            text: 'text-sky-100',
            hover: 'hover:bg-sky-900/50',
            meta: 'text-sky-300',
            ready: 'text-white',
            player: {
                bg: 'bg-sky-950/30',
                button: 'bg-sky-800 hover:bg-sky-700 text-sky-100',
                track: 'bg-sky-900',
                fill: 'bg-sky-400',
                thumb: 'bg-white',
                text: 'text-sky-200'
            }
        }
    },
    blue: {
        bubble: 'bg-blue-900 text-blue-50 border-2 border-blue-800',
        text: 'text-blue-50',
        indicator: {
            timestamp: 'text-blue-200',
            sending: 'text-blue-300',
            pending: 'text-blue-300',
            sent: 'text-blue-200',
            delivered: 'text-blue-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-blue-950 text-blue-200 border-blue-800',
        link: 'text-white decoration-blue-300',
        attachment: {
            container: 'bg-blue-950/50 border-blue-800/50',
            icon: 'text-blue-300',
            text: 'text-blue-100',
            hover: 'hover:bg-blue-900/50',
            meta: 'text-blue-300',
            ready: 'text-white',
            player: {
                bg: 'bg-blue-950/30',
                button: 'bg-blue-800 hover:bg-blue-700 text-blue-100',
                track: 'bg-blue-900',
                fill: 'bg-blue-400',
                thumb: 'bg-white',
                text: 'text-blue-200'
            }
        }
    },
    indigo: {
        bubble: 'bg-indigo-900 text-indigo-50 border-2 border-indigo-800',
        text: 'text-indigo-50',
        indicator: {
            timestamp: 'text-indigo-200',
            sending: 'text-indigo-300',
            pending: 'text-indigo-300',
            sent: 'text-indigo-200',
            delivered: 'text-indigo-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-indigo-950 text-indigo-200 border-indigo-800',
        link: 'text-white decoration-indigo-300',
        attachment: {
            container: 'bg-indigo-950/50 border-indigo-800/50',
            icon: 'text-indigo-300',
            text: 'text-indigo-100',
            hover: 'hover:bg-indigo-900/50',
            meta: 'text-indigo-300',
            ready: 'text-white',
            player: {
                bg: 'bg-indigo-950/30',
                button: 'bg-indigo-800 hover:bg-indigo-700 text-indigo-100',
                track: 'bg-indigo-900',
                fill: 'bg-indigo-400',
                thumb: 'bg-white',
                text: 'text-indigo-200'
            }
        }
    },
    violet: {
        bubble: 'bg-violet-900 text-violet-50 border-2 border-violet-800',
        text: 'text-violet-50',
        indicator: {
            timestamp: 'text-violet-200',
            sending: 'text-violet-300',
            pending: 'text-violet-300',
            sent: 'text-violet-200',
            delivered: 'text-violet-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-violet-950 text-violet-200 border-violet-800',
        link: 'text-white decoration-violet-300',
        attachment: {
            container: 'bg-violet-950/50 border-violet-800/50',
            icon: 'text-violet-300',
            text: 'text-violet-100',
            hover: 'hover:bg-violet-900/50',
            meta: 'text-violet-300',
            ready: 'text-white',
            player: {
                bg: 'bg-violet-950/30',
                button: 'bg-violet-800 hover:bg-violet-700 text-violet-100',
                track: 'bg-violet-900',
                fill: 'bg-violet-400',
                thumb: 'bg-white',
                text: 'text-violet-200'
            }
        }
    },
    purple: {
        bubble: 'bg-purple-900 text-purple-50 border-2 border-purple-800',
        text: 'text-purple-50',
        indicator: {
            timestamp: 'text-purple-200',
            sending: 'text-purple-300',
            pending: 'text-purple-300',
            sent: 'text-purple-200',
            delivered: 'text-purple-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-purple-950 text-purple-200 border-purple-800',
        link: 'text-white decoration-purple-300',
        attachment: {
            container: 'bg-purple-950/50 border-purple-800/50',
            icon: 'text-purple-300',
            text: 'text-purple-100',
            hover: 'hover:bg-purple-900/50',
            meta: 'text-purple-300',
            ready: 'text-white',
            player: {
                bg: 'bg-purple-950/30',
                button: 'bg-purple-800 hover:bg-purple-700 text-purple-100',
                track: 'bg-purple-900',
                fill: 'bg-purple-400',
                thumb: 'bg-white',
                text: 'text-purple-200'
            }
        }
    },
    fuchsia: {
        bubble: 'bg-fuchsia-900 text-fuchsia-50 border-2 border-fuchsia-800',
        text: 'text-fuchsia-50',
        indicator: {
            timestamp: 'text-fuchsia-200',
            sending: 'text-fuchsia-300',
            pending: 'text-fuchsia-300',
            sent: 'text-fuchsia-200',
            delivered: 'text-fuchsia-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-fuchsia-950 text-fuchsia-200 border-fuchsia-800',
        link: 'text-white decoration-fuchsia-300',
        attachment: {
            container: 'bg-fuchsia-950/50 border-fuchsia-800/50',
            icon: 'text-fuchsia-300',
            text: 'text-fuchsia-100',
            hover: 'hover:bg-fuchsia-900/50',
            meta: 'text-fuchsia-300',
            ready: 'text-white',
            player: {
                bg: 'bg-fuchsia-950/30',
                button: 'bg-fuchsia-800 hover:bg-fuchsia-700 text-fuchsia-100',
                track: 'bg-fuchsia-900',
                fill: 'bg-fuchsia-400',
                thumb: 'bg-white',
                text: 'text-fuchsia-200'
            }
        }
    },
    pink: {
        bubble: 'bg-pink-900 text-pink-50 border-2 border-pink-800',
        text: 'text-pink-50',
        indicator: {
            timestamp: 'text-pink-200',
            sending: 'text-pink-300',
            pending: 'text-pink-300',
            sent: 'text-pink-200',
            delivered: 'text-pink-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-pink-950 text-pink-200 border-pink-800',
        link: 'text-white decoration-pink-300',
        attachment: {
            container: 'bg-pink-950/50 border-pink-800/50',
            icon: 'text-pink-300',
            text: 'text-pink-100',
            hover: 'hover:bg-pink-900/50',
            meta: 'text-pink-300',
            ready: 'text-white',
            player: {
                bg: 'bg-pink-950/30',
                button: 'bg-pink-800 hover:bg-pink-700 text-pink-100',
                track: 'bg-pink-900',
                fill: 'bg-pink-400',
                thumb: 'bg-white',
                text: 'text-pink-200'
            }
        }
    },
    rose: {
        bubble: 'bg-rose-900 text-rose-50 border-2 border-rose-800',
        text: 'text-rose-50',
        indicator: {
            timestamp: 'text-rose-200',
            sending: 'text-rose-300',
            pending: 'text-rose-300',
            sent: 'text-rose-200',
            delivered: 'text-rose-200',
            read: 'text-cyan-300'
        },
        badge: 'bg-rose-950 text-rose-200 border-rose-800',
        link: 'text-white decoration-rose-300',
        attachment: {
            container: 'bg-rose-950/50 border-rose-800/50',
            icon: 'text-rose-300',
            text: 'text-rose-100',
            hover: 'hover:bg-rose-900/50',
            meta: 'text-rose-300',
            ready: 'text-white',
            player: {
                bg: 'bg-rose-950/30',
                button: 'bg-rose-800 hover:bg-rose-700 text-rose-100',
                track: 'bg-rose-900',
                fill: 'bg-rose-400',
                thumb: 'bg-white',
                text: 'text-rose-200'
            }
        }
    }
};

const ROLE_COLORS = Object.keys(ROLE_THEMES);

// Visitor Theme (Them in Agent System, Left Side usually)
// Matching Widget's Dark Mode Visitor Theme (Blue)
const VISITOR_THEME = {
    bubble: 'bg-blue-900 text-blue-50 border-2 border-blue-800',
    text: 'text-blue-50',
    indicator: {
        timestamp: 'text-blue-200',
        sending: 'text-blue-300',
        pending: 'text-blue-300',
        sent: 'text-blue-200',
        delivered: 'text-blue-200',
        read: 'text-cyan-300'
    },
    badge: 'bg-blue-950 text-blue-200 border-blue-800',
    link: 'text-white decoration-blue-300',
    attachment: {
        container: 'bg-blue-950/50 border-blue-800/50',
        icon: 'text-blue-300',
        text: 'text-blue-100',
        hover: 'hover:bg-blue-900/50',
        meta: 'text-blue-300',
        ready: 'text-white',
        player: {
            bg: 'bg-blue-950/30',
            button: 'bg-blue-800 hover:bg-blue-700 text-blue-100',
            track: 'bg-blue-900',
            fill: 'bg-blue-400',
            thumb: 'bg-white',
            text: 'text-blue-200'
        }
    }
};

/**
 * Get dynamic colors based on agent role using hashing
 * @param {string} role - The agent's role (e.g., 'Support', 'Sales', 'Admin')
 * @param {boolean} isBot - Whether the agent is a bot
 * @param {boolean} isVisitor - Whether the message is from a visitor
 * @returns {object} - Object containing background, text, and badge classes
 */
export const getRoleStyles = (role, isBot = false, isVisitor = false) => {
    // Visitor Theme
    if (isVisitor) {
        return VISITOR_THEME;
    }

    // Special case for Bot - consistent Emerald theme
    if (isBot) {
        return ROLE_THEMES.emerald;
    }

    if (!role) {
        // Default Agent (No Role)
        return ROLE_THEMES.violet;
    }

    // Generate consistent color from role string
    const hash = hashCode(role.toLowerCase());
    const color = ROLE_COLORS[hash % ROLE_COLORS.length];

    return ROLE_THEMES[color];
};

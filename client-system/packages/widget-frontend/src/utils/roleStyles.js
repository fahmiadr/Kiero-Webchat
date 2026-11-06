/**
 * Generate a consistent hash from a string
 * @param {string} str - input string
 * @returns {number} - hash value
 */
const hashCode = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash | 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// Explicitly define themes to ensure Tailwind scans the class names
const ROLE_THEMES = {
  slate: {
    bubble: 'bg-slate-50 border-slate-100',
    text: 'text-slate-900',
    indicator: {
      timestamp: 'text-slate-700',
      sending: 'text-slate-400',
      pending: 'text-slate-400',
      sent: 'text-slate-500',
      delivered: 'text-slate-500',
      read: 'text-blue-500',
    },
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    link: 'text-blue-600 dark:text-blue-400',
    attachment: {
      container: 'bg-slate-100 border-slate-200',
      icon: 'text-slate-500',
      text: 'text-slate-700',
      hover: 'hover:bg-slate-200',
      meta: 'text-slate-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-slate-200/50',
        button: 'bg-slate-200 hover:bg-slate-300 text-slate-700',
        track: 'bg-slate-200',
        fill: 'bg-slate-500',
        thumb: 'bg-slate-500',
        text: 'text-slate-600',
      },
    },
  },
  gray: {
    bubble: 'bg-gray-50 border-gray-100',
    text: 'text-gray-900',
    indicator: {
      timestamp: 'text-gray-700',
      sending: 'text-gray-400',
      pending: 'text-gray-400',
      sent: 'text-gray-500',
      delivered: 'text-gray-500',
      read: 'text-blue-500',
    },
    badge: 'bg-gray-100 text-gray-700 border-gray-200',
    link: 'text-blue-600 dark:text-blue-400',
    attachment: {
      container: 'bg-gray-100 border-gray-200',
      icon: 'text-gray-500',
      text: 'text-gray-700',
      hover: 'hover:bg-gray-200',
      meta: 'text-gray-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-gray-200/50',
        button: 'bg-gray-200 hover:bg-gray-300 text-gray-700',
        track: 'bg-gray-200',
        fill: 'bg-gray-500',
        thumb: 'bg-gray-500',
        text: 'text-gray-600',
      },
    },
  },
  zinc: {
    bubble: 'bg-zinc-50 border-zinc-100',
    text: 'text-zinc-900',
    indicator: {
      timestamp: 'text-zinc-700',
      sending: 'text-zinc-400',
      pending: 'text-zinc-400',
      sent: 'text-zinc-500',
      delivered: 'text-zinc-500',
      read: 'text-blue-500',
    },
    badge: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    link: 'text-blue-600 dark:text-blue-400',
    attachment: {
      container: 'bg-zinc-100 border-zinc-200',
      icon: 'text-zinc-500',
      text: 'text-zinc-700',
      hover: 'hover:bg-zinc-200',
      meta: 'text-zinc-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-zinc-200/50',
        button: 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700',
        track: 'bg-zinc-200',
        fill: 'bg-zinc-500',
        thumb: 'bg-zinc-500',
        text: 'text-zinc-600',
      },
    },
  },
  neutral: {
    bubble: 'bg-neutral-50 border-neutral-100',
    text: 'text-neutral-900',
    indicator: {
      timestamp: 'text-neutral-700',
      sending: 'text-neutral-400',
      pending: 'text-neutral-400',
      sent: 'text-neutral-500',
      delivered: 'text-neutral-500',
      read: 'text-blue-500',
    },
    badge: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    link: 'text-blue-600 dark:text-blue-400',
    attachment: {
      container: 'bg-neutral-100 border-neutral-200',
      icon: 'text-neutral-500',
      text: 'text-neutral-700',
      hover: 'hover:bg-neutral-200',
      meta: 'text-neutral-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-neutral-200/50',
        button: 'bg-neutral-200 hover:bg-neutral-300 text-neutral-700',
        track: 'bg-neutral-200',
        fill: 'bg-neutral-500',
        thumb: 'bg-neutral-500',
        text: 'text-neutral-600',
      },
    },
  },
  stone: {
    bubble: 'bg-stone-50 border-stone-100',
    text: 'text-stone-900',
    indicator: {
      timestamp: 'text-stone-700',
      sending: 'text-stone-400',
      pending: 'text-stone-400',
      sent: 'text-stone-500',
      delivered: 'text-stone-500',
      read: 'text-blue-500',
    },
    badge: 'bg-stone-100 text-stone-700 border-stone-200',
    link: 'text-blue-600 dark:text-blue-400',
    attachment: {
      container: 'bg-stone-100 border-stone-200',
      icon: 'text-stone-500',
      text: 'text-stone-700',
      hover: 'hover:bg-stone-200',
      meta: 'text-stone-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-stone-200/50',
        button: 'bg-stone-200 hover:bg-stone-300 text-stone-700',
        track: 'bg-stone-200',
        fill: 'bg-stone-500',
        thumb: 'bg-stone-500',
        text: 'text-stone-600',
      },
    },
  },
  red: {
    bubble: 'bg-red-50 border-red-100',
    text: 'text-red-900',
    indicator: {
      timestamp: 'text-red-700',
      sending: 'text-red-400',
      pending: 'text-red-400',
      sent: 'text-red-500',
      delivered: 'text-red-500',
      read: 'text-blue-500',
    },
    badge: 'bg-red-100 text-red-700 border-red-200',
    link: 'text-red-600 dark:text-red-400',
    attachment: {
      container: 'bg-red-100 border-red-200',
      icon: 'text-red-500',
      text: 'text-red-700',
      hover: 'hover:bg-red-200',
      meta: 'text-red-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-red-200/50',
        button: 'bg-red-200 hover:bg-red-300 text-red-700',
        track: 'bg-red-200',
        fill: 'bg-red-600',
        thumb: 'bg-red-600',
        text: 'text-red-700',
      },
    },
  },
  orange: {
    bubble: 'bg-orange-50 border-orange-100',
    text: 'text-orange-900',
    indicator: {
      timestamp: 'text-orange-700',
      sending: 'text-orange-400',
      pending: 'text-orange-400',
      sent: 'text-orange-500',
      delivered: 'text-orange-500',
      read: 'text-blue-500',
    },
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    link: 'text-orange-600 dark:text-orange-400',
    attachment: {
      container: 'bg-orange-100 border-orange-200',
      icon: 'text-orange-500',
      text: 'text-orange-700',
      hover: 'hover:bg-orange-200',
      meta: 'text-orange-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-orange-200/50',
        button: 'bg-orange-200 hover:bg-orange-300 text-orange-700',
        track: 'bg-orange-200',
        fill: 'bg-orange-600',
        thumb: 'bg-orange-600',
        text: 'text-orange-700',
      },
    },
  },
  amber: {
    bubble: 'bg-amber-50 border-amber-100',
    text: 'text-amber-900',
    indicator: {
      timestamp: 'text-amber-700',
      sending: 'text-amber-400',
      pending: 'text-amber-400',
      sent: 'text-amber-500',
      delivered: 'text-amber-500',
      read: 'text-blue-500',
    },
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    link: 'text-amber-600 dark:text-amber-400',
    attachment: {
      container: 'bg-amber-100 border-amber-200',
      icon: 'text-amber-500',
      text: 'text-amber-700',
      hover: 'hover:bg-amber-200',
      meta: 'text-amber-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-amber-200/50',
        button: 'bg-amber-200 hover:bg-amber-300 text-amber-700',
        track: 'bg-amber-200',
        fill: 'bg-amber-600',
        thumb: 'bg-amber-600',
        text: 'text-amber-700',
      },
    },
  },
  green: {
    bubble: 'bg-green-50 border-green-100',
    text: 'text-green-900',
    indicator: {
      timestamp: 'text-green-700',
      sending: 'text-green-400',
      pending: 'text-green-400',
      sent: 'text-green-500',
      delivered: 'text-green-500',
      read: 'text-blue-500',
    },
    badge: 'bg-green-100 text-green-700 border-green-200',
    link: 'text-green-600 dark:text-green-400',
    attachment: {
      container: 'bg-green-100 border-green-200',
      icon: 'text-green-500',
      text: 'text-green-700',
      hover: 'hover:bg-green-200',
      meta: 'text-green-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-green-200/50',
        button: 'bg-green-200 hover:bg-green-300 text-green-700',
        track: 'bg-green-200',
        fill: 'bg-green-600',
        thumb: 'bg-green-600',
        text: 'text-green-700',
      },
    },
  },
  emerald: {
    bubble: 'bg-emerald-50 border-emerald-100',
    text: 'text-emerald-900',
    indicator: {
      timestamp: 'text-emerald-700',
      sending: 'text-emerald-400',
      pending: 'text-emerald-400',
      sent: 'text-emerald-500',
      delivered: 'text-emerald-500',
      read: 'text-blue-500',
    },
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    link: 'text-emerald-600 dark:text-emerald-400',
    attachment: {
      container: 'bg-emerald-100 border-emerald-200',
      icon: 'text-emerald-500',
      text: 'text-emerald-700',
      hover: 'hover:bg-emerald-200',
      meta: 'text-emerald-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-emerald-200/50',
        button: 'bg-emerald-200 hover:bg-emerald-300 text-emerald-700',
        track: 'bg-emerald-200',
        fill: 'bg-emerald-600',
        thumb: 'bg-emerald-600',
        text: 'text-emerald-700',
      },
    },
  },
  teal: {
    bubble: 'bg-teal-50 border-teal-100',
    text: 'text-teal-900',
    indicator: {
      timestamp: 'text-teal-700',
      sending: 'text-teal-400',
      pending: 'text-teal-400',
      sent: 'text-teal-500',
      delivered: 'text-teal-500',
      read: 'text-blue-500',
    },
    badge: 'bg-teal-100 text-teal-700 border-teal-200',
    link: 'text-teal-600 dark:text-teal-400',
    attachment: {
      container: 'bg-teal-100 border-teal-200',
      icon: 'text-teal-500',
      text: 'text-teal-700',
      hover: 'hover:bg-teal-200',
      meta: 'text-teal-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-teal-200/50',
        button: 'bg-teal-200 hover:bg-teal-300 text-teal-700',
        track: 'bg-teal-200',
        fill: 'bg-teal-600',
        thumb: 'bg-teal-600',
        text: 'text-teal-700',
      },
    },
  },
  cyan: {
    bubble: 'bg-cyan-50 border-cyan-100',
    text: 'text-cyan-900',
    indicator: {
      timestamp: 'text-cyan-700',
      sending: 'text-cyan-400',
      pending: 'text-cyan-400',
      sent: 'text-cyan-500',
      delivered: 'text-cyan-500',
      read: 'text-blue-500',
    },
    badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    link: 'text-cyan-600 dark:text-cyan-400',
    attachment: {
      container: 'bg-cyan-100 border-cyan-200',
      icon: 'text-cyan-500',
      text: 'text-cyan-700',
      hover: 'hover:bg-cyan-200',
      meta: 'text-cyan-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-cyan-200/50',
        button: 'bg-cyan-200 hover:bg-cyan-300 text-cyan-700',
        track: 'bg-cyan-200',
        fill: 'bg-cyan-600',
        thumb: 'bg-cyan-600',
        text: 'text-cyan-700',
      },
    },
  },
  sky: {
    bubble: 'bg-sky-50 border-sky-100',
    text: 'text-sky-900',
    indicator: {
      timestamp: 'text-sky-700',
      sending: 'text-sky-400',
      pending: 'text-sky-400',
      sent: 'text-sky-500',
      delivered: 'text-sky-500',
      read: 'text-blue-500',
    },
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    link: 'text-sky-600 dark:text-sky-400',
    attachment: {
      container: 'bg-sky-100 border-sky-200',
      icon: 'text-sky-500',
      text: 'text-sky-700',
      hover: 'hover:bg-sky-200',
      meta: 'text-sky-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-sky-200/50',
        button: 'bg-sky-200 hover:bg-sky-300 text-sky-700',
        track: 'bg-sky-200',
        fill: 'bg-sky-600',
        thumb: 'bg-sky-600',
        text: 'text-sky-700',
      },
    },
  },
  blue: {
    bubble: 'bg-blue-50 border-blue-100',
    text: 'text-blue-900',
    indicator: {
      timestamp: 'text-blue-700',
      sending: 'text-blue-400',
      pending: 'text-blue-400',
      sent: 'text-blue-500',
      delivered: 'text-blue-500',
      read: 'text-blue-500',
    },
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    link: 'text-blue-600 dark:text-blue-400',
    attachment: {
      container: 'bg-blue-100 border-blue-200',
      icon: 'text-blue-500',
      text: 'text-blue-700',
      hover: 'hover:bg-blue-200',
      meta: 'text-blue-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-blue-200/50',
        button: 'bg-blue-200 hover:bg-blue-300 text-blue-700',
        track: 'bg-blue-200',
        fill: 'bg-blue-600',
        thumb: 'bg-blue-600',
        text: 'text-blue-700',
      },
    },
  },
  indigo: {
    bubble: 'bg-indigo-50 border-indigo-100',
    text: 'text-indigo-900',
    indicator: {
      timestamp: 'text-indigo-700',
      sending: 'text-indigo-400',
      pending: 'text-indigo-400',
      sent: 'text-indigo-500',
      delivered: 'text-indigo-500',
      read: 'text-blue-500',
    },
    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    link: 'text-indigo-600 dark:text-indigo-400',
    attachment: {
      container: 'bg-indigo-100 border-indigo-200',
      icon: 'text-indigo-500',
      text: 'text-indigo-700',
      hover: 'hover:bg-indigo-200',
      meta: 'text-indigo-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-indigo-200/50',
        button: 'bg-indigo-200 hover:bg-indigo-300 text-indigo-700',
        track: 'bg-indigo-200',
        fill: 'bg-indigo-600',
        thumb: 'bg-indigo-600',
        text: 'text-indigo-700',
      },
    },
  },
  violet: {
    bubble: 'bg-violet-50 border-violet-100',
    text: 'text-violet-900',
    indicator: {
      timestamp: 'text-violet-700',
      sending: 'text-violet-400',
      pending: 'text-violet-400',
      sent: 'text-violet-500',
      delivered: 'text-violet-500',
      read: 'text-blue-500',
    },
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    link: 'text-violet-600 dark:text-violet-400',
    attachment: {
      container: 'bg-violet-100 border-violet-200',
      icon: 'text-violet-500',
      text: 'text-violet-700',
      hover: 'hover:bg-violet-200',
      meta: 'text-violet-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-violet-200/50',
        button: 'bg-violet-200 hover:bg-violet-300 text-violet-700',
        track: 'bg-violet-200',
        fill: 'bg-violet-600',
        thumb: 'bg-violet-600',
        text: 'text-violet-700',
      },
    },
  },
  purple: {
    bubble: 'bg-purple-50 border-purple-100',
    text: 'text-purple-900',
    indicator: {
      timestamp: 'text-purple-700',
      sending: 'text-purple-400',
      pending: 'text-purple-400',
      sent: 'text-purple-500',
      delivered: 'text-purple-500',
      read: 'text-blue-500',
    },
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    link: 'text-purple-600 dark:text-purple-400',
    attachment: {
      container: 'bg-purple-100 border-purple-200',
      icon: 'text-purple-500',
      text: 'text-purple-700',
      hover: 'hover:bg-purple-200',
      meta: 'text-purple-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-purple-200/50',
        button: 'bg-purple-200 hover:bg-purple-300 text-purple-700',
        track: 'bg-purple-200',
        fill: 'bg-purple-600',
        thumb: 'bg-purple-600',
        text: 'text-purple-700',
      },
    },
  },
  fuchsia: {
    bubble: 'bg-fuchsia-50 border-fuchsia-100',
    text: 'text-fuchsia-900',
    indicator: {
      timestamp: 'text-fuchsia-700',
      sending: 'text-fuchsia-400',
      pending: 'text-fuchsia-400',
      sent: 'text-fuchsia-500',
      delivered: 'text-fuchsia-500',
      read: 'text-blue-500',
    },
    badge: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    link: 'text-fuchsia-600 dark:text-fuchsia-400',
    attachment: {
      container: 'bg-fuchsia-100 border-fuchsia-200',
      icon: 'text-fuchsia-500',
      text: 'text-fuchsia-700',
      hover: 'hover:bg-fuchsia-200',
      meta: 'text-fuchsia-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-fuchsia-200/50',
        button: 'bg-fuchsia-200 hover:bg-fuchsia-300 text-fuchsia-700',
        track: 'bg-fuchsia-200',
        fill: 'bg-fuchsia-600',
        thumb: 'bg-fuchsia-600',
        text: 'text-fuchsia-700',
      },
    },
  },
  pink: {
    bubble: 'bg-pink-50 border-pink-100',
    text: 'text-pink-900',
    indicator: {
      timestamp: 'text-pink-700',
      sending: 'text-pink-400',
      pending: 'text-pink-400',
      sent: 'text-pink-500',
      delivered: 'text-pink-500',
      read: 'text-blue-500',
    },
    badge: 'bg-pink-100 text-pink-700 border-pink-200',
    link: 'text-pink-600 dark:text-pink-400',
    attachment: {
      container: 'bg-pink-100 border-pink-200',
      icon: 'text-pink-500',
      text: 'text-pink-700',
      hover: 'hover:bg-pink-200',
      meta: 'text-pink-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-pink-200/50',
        button: 'bg-pink-200 hover:bg-pink-300 text-pink-700',
        track: 'bg-pink-200',
        fill: 'bg-pink-600',
        thumb: 'bg-pink-600',
        text: 'text-pink-700',
      },
    },
  },
  rose: {
    bubble: 'bg-rose-50 border-rose-100',
    text: 'text-rose-900',
    indicator: {
      timestamp: 'text-rose-700',
      sending: 'text-rose-400',
      pending: 'text-rose-400',
      sent: 'text-rose-500',
      delivered: 'text-rose-500',
      read: 'text-blue-500',
    },
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    link: 'text-rose-600 dark:text-rose-400',
    attachment: {
      container: 'bg-rose-100 border-rose-200',
      icon: 'text-rose-500',
      text: 'text-rose-700',
      hover: 'hover:bg-rose-200',
      meta: 'text-rose-500',
      ready: 'text-emerald-600',
      player: {
        bg: 'bg-rose-200/50',
        button: 'bg-rose-200 hover:bg-rose-300 text-rose-700',
        track: 'bg-rose-200',
        fill: 'bg-rose-600',
        thumb: 'bg-rose-600',
        text: 'text-rose-700',
      },
    },
  },
};

const ROLE_COLORS = Object.keys(ROLE_THEMES);

// Shared progress and pause indicator colors
export const PROGRESS_COLORS = {
  active: 'currentColor',
  paused: '#fbbf24', // amber-400
  pausedIcon: 'text-amber-500 fill-amber-500',
};

// Inject PROGRESS_COLORS into all themes
ROLE_COLORS.forEach((color) => {
  ROLE_THEMES[color].progressColors = PROGRESS_COLORS;
});

// Visitor Theme (Me) - Consistent Blue
const VISITOR_THEME = {
  bubble: 'bg-blue-600 border-blue-600',
  text: 'text-white',
  indicator: {
    timestamp: 'text-blue-100',
    sending: 'text-blue-200',
    pending: 'text-blue-200',
    sent: 'text-blue-100',
    delivered: 'text-blue-100',
    read: 'text-cyan-300',
  },
  badge: 'bg-blue-100 text-blue-700 border-blue-200',
  link: 'text-white decoration-blue-300',
  attachment: {
    container: 'bg-blue-700 border-blue-500/30', // Darker blue for attachment bg
    icon: 'text-blue-100',
    text: 'text-blue-50',
    hover: 'hover:bg-blue-600',
    meta: 'text-blue-200',
    ready: 'text-cyan-300',
    player: {
      bg: 'bg-black/10',
      button: 'bg-white/20 hover:bg-white/30 text-white',
      track: 'bg-white/20',
      fill: 'bg-white/90',
      thumb: 'bg-cyan-500',
      text: 'text-white/80',
    },
  },
  progressColors: PROGRESS_COLORS,
};

/**
 * Get dynamic colors based on agent role using hashing
 * @param {string} role - The agent's role (e.g., 'Support', 'Sales', 'Admin')
 * @param {boolean} isBot - Whether the agent is a bot
 * @param {boolean} isMe - Whether the message is from the visitor (Me)
 * @returns {object} - Object containing bubble, text, indicator, and attachment styles
 */
export const getRoleStyles = (role, isBot = false, isMe = false) => {
  // Visitor (Me) - Always Blue
  if (isMe) {
    return VISITOR_THEME;
  }

  // Special case for Bot - consistent Emerald theme
  if (isBot) {
    return ROLE_THEMES.emerald;
  }

  if (!role) {
    // Default Agent (No Role)
    return ROLE_THEMES.gray;
  }

  // Generate consistent color from role string
  const hash = hashCode(role.toLowerCase());
  const color = ROLE_COLORS[hash % ROLE_COLORS.length];

  return ROLE_THEMES[color];
};

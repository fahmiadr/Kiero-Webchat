/**
 * Avatar Utility Functions
 * 
 * Provides consistent avatar colors and initials based on user names.
 */

// Avatar color palette - vibrant colors for better visibility
const AVATAR_COLORS = [
    'bg-rose-500',
    'bg-pink-500',
    'bg-fuchsia-500',
    'bg-purple-500',
    'bg-violet-500',
    'bg-indigo-500',
    'bg-blue-500',
    'bg-sky-500',
    'bg-cyan-500',
    'bg-teal-500',
    'bg-emerald-500',
    'bg-green-500',
    'bg-lime-500',
    'bg-amber-500',
    'bg-orange-500',
    'bg-red-500',
];

/**
 * Generates a consistent color class based on a string (name)
 * @param {string} name - The name to generate color from
 * @returns {string} Tailwind CSS background color class
 */
export const getAvatarColor = (name) => {
    if (!name) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

/**
 * Gets initials from a name (max 2 characters)
 * @param {string} name - The name to extract initials from
 * @returns {string} 1-2 character initials
 */
export const getInitials = (name) => {
    if (!name) return 'V';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
};

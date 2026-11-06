/**
 * Default Theme Configuration
 *
 * Single source of truth for all widget theme defaults.
 * This object is sent to the Theme Builder via postMessage on preview init,
 * and used by themeStore as the base for deep-merging incoming config.
 */
export const DEFAULT_THEME_CONFIG = {
  launcher: {
    launcherButton: {
      size: 64,
      backgroundColor: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
      hoverColor: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
      pingColor: '#60A5FA',
      position: 'bottom-right',
      iconSettings: {
        type: 'icon',
        icon: 'message-circle',
        imageUrl: '',
        color: '#FFFFFF',
        availableIcons: [
          { id: 'message-square', label: 'Default' },
          { id: 'message-square-more', label: 'Chat' },
          { id: 'message-square-text', label: 'Text' },
          { id: 'messages-square', label: 'Multiple' },
          { id: 'message-circle', label: 'Circle' },
          { id: 'message-circle-more', label: 'Circle Chat' },
          { id: 'headphones', label: 'Support' },
          { id: 'help-circle', label: 'Help' },
          { id: 'smile', label: 'Smile' },
          { id: 'zap', label: 'Fast' },
          { id: 'sparkles', label: 'AI' },
          { id: 'send', label: 'Send' },
        ],
      },
    },
  },

  preChatForm: {
    header: {
      backgroundColor: 'linear-gradient(to right, #2563EB, #1D4ED8, #4338CA)',

      iconSettings: {
        type: 'icon',
        icon: 'message-circle',
        imageUrl: '',
        color: '#FFFFFF',
        availableIcons: [
          { id: 'message-square', label: 'Default' },
          { id: 'message-square-more', label: 'Chat' },
          { id: 'message-square-text', label: 'Text' },
          { id: 'messages-square', label: 'Multiple' },
          { id: 'message-circle', label: 'Circle' },
          { id: 'message-circle-more', label: 'Circle Chat' },
          { id: 'headphones', label: 'Support' },
          { id: 'help-circle', label: 'Help' },
          { id: 'smile', label: 'Smile' },
          { id: 'zap', label: 'Fast' },
          { id: 'sparkles', label: 'AI' },
          { id: 'send', label: 'Send' },
        ],
      },

      titleSettings: {
        text: 'Live Chat',
        color: '#FFFFFF',
        fontWeight: 'font-semibold',
        fontSize: 14,
        fontSizeUnit: 'px',
        italic: false,
      },

      subtitleSettings: {
        text: 'Kami siap membantu Anda',
        color: '#FFFFFFCC',
        fontWeight: 'font-medium',
        fontSize: 11,
        fontSizeUnit: 'px',
        italic: false,
      },

      buttonSettings: {
        type: 'icon',
        icon: 'minus',
        imageUrl: '',
        color: '#FFFFFF',
        backgroundColor: '#FFFFFF1A',
        hoverColor: '#FFFFFF33',
        activeColor: '#FFFFFF4D',
        availableIcons: [
          { id: 'minus', label: 'Minimize' },
          { id: 'x', label: 'Close' },
          { id: 'chevron-down', label: 'Down' },
          { id: 'arrow-down', label: 'Arrow' },
          { id: 'shrink', label: 'Shrink' },
        ],
      },
    },

    welcomeMessage: {
      iconSettings: {
        type: 'icon',
        icon: 'message-circle',
        imageUrl: '',
        color: '#2563EB',
        backgroundColor: '#EFF6FF',
        availableIcons: [
          { id: 'message-square', label: 'Default' },
          { id: 'message-square-more', label: 'Chat' },
          { id: 'message-square-text', label: 'Text' },
          { id: 'messages-square', label: 'Multiple' },
          { id: 'message-circle', label: 'Circle' },
          { id: 'message-circle-more', label: 'Circle Chat' },
          { id: 'headphones', label: 'Support' },
          { id: 'help-circle', label: 'Help' },
          { id: 'smile', label: 'Smile' },
          { id: 'zap', label: 'Fast' },
          { id: 'sparkles', label: 'AI' },
          { id: 'send', label: 'Send' },
        ],
      },
      titleSettings: {
        text: 'Halo! 👋',
        color: '#1F2937',
        fontWeight: 'font-bold',
        fontSize: 20,
        fontSizeUnit: 'px',
        italic: false,
      },
      subtitleSettings: {
        text: 'Silakan isi data diri Anda untuk memulai percakapan dengan tim kami.',
        color: '#6B7280',
        fontWeight: 'font-normal',
        fontSize: 14,
        fontSizeUnit: 'px',
        italic: false,
      },
    },

    form: {
      bgColor: '#F9FAFB',
      borderColor: '#E5E7EB',
      labelColor: '#1F2937',
      formColor: '#9CA3AF',
      activeState: {
        borderColor: '#3B82F6',
        backgroundColor: '#FFFFFF',
        ringColor: '#DBEAFE',
      },
    },

    submitButton: {
      backgroundColor: 'linear-gradient(to right, #3B82F6, #2563EB)',
      hoverColor: 'linear-gradient(to right, #2563EB, #1D4ED8)',
      activeColor: '#1E40AF',
      iconSettings: {
        type: 'icon',
        icon: 'arrow-right',
        imageUrl: '',
        color: '#FFFFFF',
        availableIcons: [
          { id: 'send', label: 'Send' },
          { id: 'arrow-right', label: 'Arrow Right' },
          { id: 'chevron-right', label: 'Chevron Right' },
          { id: 'play', label: 'Play' },
          { id: 'check', label: 'Check' },
          { id: 'rocket', label: 'Rocket' },
          { id: 'user-plus', label: 'User Plus' },
          { id: 'message-circle', label: 'Chat Circle' },
          { id: 'zap', label: 'Quick Start' },
        ],
      },
      textSettings: {
        text: 'Mulai Obrolan',
        color: '#FFFFFF',
        fontWeight: 'font-medium',
        fontSize: 14,
        fontSizeUnit: 'px',
        italic: false,
      },
    },
  },
};

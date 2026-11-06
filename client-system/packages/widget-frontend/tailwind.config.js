/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx}'],

    // CSS Isolation Strategy:
    // Shadow DOM (main.jsx) provides complete style encapsulation.
    // No prefix or important selector needed - Shadow DOM prevents class collision.
    // Preflight is enabled since Shadow DOM isolates our reset from host page.

    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8'
                },
                widget: {
                    bg: '#ffffff',
                    text: '#1f2937',
                    border: '#e5e7eb'
                }
            },
            boxShadow: {
                'widget': '0 5px 40px rgba(0,0,0,0.16)'
            },
            animation: {
                'fade-in': 'fadeIn 0.2s ease-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'pulse-dot': 'pulseDot 1.5s infinite',
                'bounce-short': 'bounceShort 1s infinite',
                'bounce-subtle': 'bounceSubtle 2s infinite'
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' }
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' }
                },
                pulseDot: {
                    '0%, 100%': { opacity: '0.4' },
                    '50%': { opacity: '1' }
                },
                bounceShort: {
                    '0%, 100%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
                    '50%': { transform: 'translateY(-25%)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' }
                },
                bounceSubtle: {
                    '0%, 100%': { transform: 'translateY(-15%)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
                    '50%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' }
                }
            }
        }
    },

    plugins: [
        require('tailwindcss-animate')
    ]
};

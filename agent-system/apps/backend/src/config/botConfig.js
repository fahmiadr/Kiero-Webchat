/**
 * Bot Configuration
 * 
 * Centralized configuration for the automated bot service.
 * Customize messages, delays, and triggers here.
 */

export const botConfig = {
    // Bot identity
    name: 'Support Bot',

    // Welcome message sent when new chat starts
    welcomeMessage: 'Selamat datang di pusat bantuan kami. Untuk komunikasi langsung dengan agent, mohon ketik *agent*.',

    // Delay settings (in milliseconds)
    delays: {
        typing: 1500,      // Delay before "typing" indicator
        response: 2500,    // Delay before bot sends response
        delivered: 200,    // Delay before "delivered" status
        read: 1000         // Delay before "read" status
    },

    // Keywords that trigger agent request
    requestAgentKeywords: [
        'agent',
        'support',
        'bantuan',
        'agen',
        'agents',
        'cs',
        'admin'
    ],

    // Message when user requests agent
    agentRequestedMessage: 'Saya mengerti kamu ingin berbicara dengan agent. Mohon tunggu sebentar ya, saya akan sambungkan dengan agent yang tersedia. 🙏',

    // Message when user is in queue
    queueMessage: 'Kamu sedang dalam antrean. Agent akan segera melayanimu sebentar lagi.',

    // Message when agent connects
    agentConnectedMessage: 'Kabar baik! Seorang agent telah bergabung dalam chat dan siap membantumu sekarang.',

    // Auto-reply patterns (simple keyword matching)
    autoReplies: [
        {
            triggers: ['hello', 'hi', 'hey', 'halo', 'hai', 'pagi', 'siang', 'sore', 'malam'],
            response: 'Halo! 👋 Ada yang bisa saya bantu hari ini?'
        },
        {
            triggers: ['thanks', 'thank you', 'terima kasih', 'makasih'],
            response: 'Sama-sama! Apakah ada hal lain yang bisa saya bantu?'
        },
        {
            triggers: ['bye', 'goodbye', 'selamat tinggal', 'dah', 'duluan'],
            response: 'Sampai jumpa! Terima kasih sudah menghubungi kami. Semoga harimu menyenangkan! 😊'
        }
    ],

    // Default response when no pattern matches
    defaultResponse: 'Terima kasih atas pesanmu. Apakah kamu ingin saya sambungkan dengan agent untuk bantuan lebih lanjut?',

    // Maximum messages before suggesting agent
    maxBotMessages: 5,
    suggestAgentMessage: 'Sepertinya kamu memiliki pertanyaan lebih lanjut. Maukah saya sambungkan dengan agent agar bisa dibantu lebih detail?',

    // Session TTL (seconds) - default 24 hours
    // Controls how long Redis sessions persist for widget visitors
    sessionTtlSeconds: 86400,

    // Agent wait timeout (minutes) - default 60 minutes
    // Auto-close chat if no agent handles within this duration
    agentWaitTimeoutMinutes: 60,

    // Message sent to visitor when auto-closed due to timeout
    agentWaitTimeoutMessage: 'Mohon maaf, agent kami sedang tidak tersedia, mohon dihubungi beberapa saat kembali.',

    // Default timezone for operating hours
    timezone: 'Asia/Jakarta',

    // Default templates for operating status
    closedMessage: 'Maaf, saat ini kami sedang tutup. Kami buka kembali {{buka_berikutnya}}.',
    holidayMessage: 'Maaf, saat ini kami sedang libur. Kami buka kembali {{buka_berikutnya}}.'
};

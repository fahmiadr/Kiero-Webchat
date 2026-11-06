import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { compression } from 'vite-plugin-compression2'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE_PATH || '/', // Configurable Base Path
    plugins: [
      react(), 
      tailwindcss(),
      compression({
        algorithm: 'gzip',
        exclude: [/\.(br)$/, /\.(gz)$/],
        threshold: 1024,
        deleteOriginalAssets: false,
        skipIfLargerOrEqual: true,
      })
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5174,
      host: '0.0.0.0',
      // Required headers for FFmpeg.wasm SharedArrayBuffer support
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    // Preview server also needs these headers for production builds
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    // Optimize FFmpeg.wasm dependencies
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
  }
})

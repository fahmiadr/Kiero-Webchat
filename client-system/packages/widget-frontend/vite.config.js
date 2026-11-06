import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compression } from 'vite-plugin-compression2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH || '/', // Configurable Base Path
    plugins: [
      react(),
      // Generate .gz
      compression({
        algorithm: 'gzip',
        exclude: [/\.(br)$/, /\.(gz)$/],
        threshold: 1024,
        deleteOriginalAssets: false,
        skipIfLargerOrEqual: true,
      }),
    ],

    // Define process.env for browser compatibility
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env': JSON.stringify({})
    },

    server: {
      port: 5173,
      host: '0.0.0.0',
      strictPort: false,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
      }
    },

    build: {
      lib: {
        entry: resolve(__dirname, 'src/main.jsx'),
        name: 'LiveChatWidget',
        fileName: 'embed',
        formats: ['iife']
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          assetFileNames: 'embed.[ext]'
        }
      },
      minify: 'esbuild',
      // Ensure CSS is extracted to a single file
      cssCodeSplit: false
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@components': resolve(__dirname, 'src/components'),
        '@hooks': resolve(__dirname, 'src/hooks'),
        '@stores': resolve(__dirname, 'src/stores'),
        '@services': resolve(__dirname, 'src/services')
      }
    }
  }
});

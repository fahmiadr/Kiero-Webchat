import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // ─── Global ignores ───────────────────────────────────────
  globalIgnores([
    'dist/**',
    'node_modules/**',
    'public/**',
    '*.min.js',
  ]),

  // ─── Config files (Node.js context) ───────────────────────
  {
    files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // ─── Main config (JS + JSX) ──────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // ── Variables ────────────────────────────────────────
      // Biome handles unused imports (noUnusedImports).
      // ESLint handles unused vars with common conventions.
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^(?:[A-Z_]|motion|m)',
        args: 'after-used',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],

      // ── Best practices ───────────────────────────────────
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-implicit-coercion': 'warn',
      'no-throw-literal': 'error',

      // ── Code quality ─────────────────────────────────────
      'no-nested-ternary': 'warn',
      'no-unneeded-ternary': 'warn',
      'prefer-template': 'warn',

      // ── React Refresh ────────────────────────────────────
      // Allow non-component exports in utility files
      'react-refresh/only-export-components': ['warn', {
        allowExportNames: ['getFileIconProps'],
        allowConstantExport: true,
      }],

      // ── Strict React 19 Rules (Disabled for now) ─────────
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
]);

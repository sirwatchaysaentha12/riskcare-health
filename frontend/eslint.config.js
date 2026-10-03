import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  // Vendored third-party MediaPipe WASM loader — not project source, never edited.
  globalIgnores(['public/mediapipe/wasm/**/*.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // respiratorySignal.js is the locked breathing-rate algorithm (fixed by spec).
  // Only the unused-variable rule is relaxed here; all other rules still apply.
  // Placed after the main block so the narrow override wins.
  {
    files: ['src/utils/respiratorySignal.js'],
    rules: { 'no-unused-vars': 'off' },
  },
])

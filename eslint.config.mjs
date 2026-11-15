// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

/**
 * ESLint busca errores y malas prácticas; el estilo (comillas, espacios...) es cosa de Prettier.
 * Por eso `eslint-config-prettier` va al final: apaga las reglas de estilo que chocarían con él.
 */
export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', '*.config.{ts,mts,mjs}', 'e2e/**/*.ts', 'evals/**/*.ts'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Las dos reglas clásicas: detectan hooks mal llamados y dependencias olvidadas.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    rules: {
      // `_algo` = "sé que no lo uso" (parámetros de callbacks de Electron, por ejemplo).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  prettier
)

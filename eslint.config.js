import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'test-results/**',
      'playwright-report/**',
      '**/__pycache__/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
  {
    files: ['extension/**/*.js'],
    languageOptions: { globals: { ...globals.browser, messenger: 'readonly' } },
  },
  {
    files: ['test/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['test/ui/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
];

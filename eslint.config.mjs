// Single flat ESLint config for the whole monorepo.
// One config keeps rules consistent across the Expo app, the NestJS server and
// the shared packages (see CLAUDE.md "Code Quality").
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/expo-env.d.ts',
      '**/nativewind-env.d.ts',
      'apps/*/ios/**',
      'apps/*/android/**',
      'server/generated/**',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Plain CommonJS files: Jest setup, design tokens consumed by tailwind.config.
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Shared rules for every TypeScript file in the repo.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // CLAUDE.md: no `any` without a documented reason.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // CLAUDE.md: never silently swallow errors.
      'no-empty': ['error', { allowEmptyCatch: false }],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Expo / React Native app.
  {
    files: ['apps/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2021, __DEV__: 'readonly' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // NestJS server: decorator-heavy, Node globals.
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Nest DI relies on parameter properties and empty constructors/classes.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // `import type` erases the import, which breaks the `design:paramtypes`
      // metadata Nest reads to resolve constructor dependencies. Injected
      // classes must stay value imports.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },

  // Shared packages are platform-agnostic.
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Tests may use looser typing.
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.test.tsx', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Must stay last: turns off rules that fight Prettier.
  prettier,
);

import globals from 'globals'
import unusedImports from 'eslint-plugin-unused-imports'
import tseslint from 'typescript-eslint'

/**
 * @type {import('eslint').Linter.Config}
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.imagine/**',
      '.cursor/**',
      'src/components/ui/**',
      '.output',
      '.nitro',
      'prettier.config.js',
      'eslint.config.js',
      'src/routeTree.gen.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'off',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/only-throw-error': 'off', // won't work with TanStack redirects
    },
  },
  {
    // chrome-extension/** is browser ES modules that live outside the TS project,
    // so the type-aware project service can't resolve them and every file errors
    // with "was not found by the project service". Lint them without type info.
    files: ['chrome-extension/**/*.js'],
    languageOptions: {
      parserOptions: { projectService: false, project: null },
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        // Injected by scripts/build-extension.ts via Bun.build `define`.
        __TECHRADAR_BACKEND_URL__: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      // Without type info nothing else notices a call to a function that no
      // longer exists (a removed helper broke the matrix view at runtime).
      'no-undef': 'error',
    },
  },
  {
    // Standalone Node utility run by hand (`node generate-icons.js`), not part
    // of the extension's ES-module runtime — CommonJS require() is correct here.
    files: ['chrome-extension/generate-icons.js'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
)

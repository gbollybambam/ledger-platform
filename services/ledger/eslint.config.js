import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const NO_FLOAT = 'No floating-point math for money. Use bigint and integer strings.';

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A dropped promise in money code can lose a write silently.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      // Zero floating-point math (INV-01). If one is truly needed, disable the rule
      // on that line and write the reason next to it.
      'no-restricted-globals': ['error', { name: 'parseFloat', message: NO_FLOAT }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: NO_FLOAT },
        { object: 'Math', property: 'round', message: NO_FLOAT },
        { object: 'Math', property: 'floor', message: NO_FLOAT },
        { object: 'Math', property: 'ceil', message: NO_FLOAT },
        { object: 'Math', property: 'trunc', message: NO_FLOAT },
        { property: 'toFixed', message: NO_FLOAT },
      ],
    },
  },
  {
    // In app code, a number with a decimal point is never allowed.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[raw=/^[0-9]+\\.[0-9]*$/]', message: NO_FLOAT },
      ],
    },
  },
  prettier,
);

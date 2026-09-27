import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Copie française : apostrophes et guillemets littéraux dans le JSX sont
      // volontaires et valides — la règle ne protège ici contre rien.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    rules: {
      // Une variable préfixée `_` est un rebut assumé — typiquement le
      // `const { password: _omit, ...reste } = input` qui retire une clé d'un
      // objet. Sans cette exception, l'idiome déclenche un faux positif et
      // finit par masquer les vrais rebuts.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Mocks Prisma profonds : `any` légitime dans les helpers/specs de test.
    files: ['test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default config;

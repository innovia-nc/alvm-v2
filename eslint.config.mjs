import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'next-env.d.ts',
      'prisma/seed*.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Le gate hooks React est l'objectif principal (TD-A3) : on veut le
      // signal sans bloquer toute la CI tant que la base n'est pas nettoyée.
      'react-hooks/exhaustive-deps': 'warn',
      // `any` est très présent dans la base (routers, mappers Prisma) : on le
      // signale en warning plutôt que de bloquer la CI. Dette à résorber à part.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Contenu francophone : apostrophes/guillemets omniprésents dans le JSX
      // (« l'utilisateur »…). Règle purement stylistique, sans impact runtime.
      'react/no-unescaped-entities': 'off',
      // tsc --noUnusedLocals/Parameters couvre déjà les inutilisés côté types ;
      // on évite le doublon bruyant ESLint, mais on autorise le préfixe `_`.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Les tests manipulent des mocks volontairement souples.
    files: ['test/**/*.ts', 'test/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default eslintConfig;

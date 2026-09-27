import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Une variable préfixée `_` est un rebut assumé (`const { password: _omit, ...reste } = input`).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Isolation multi-tenant : tout SQL passe par des requêtes paramétrées
      // (tagged templates). Le SQL « unsafe » concaténé pourrait réécrire le
      // contexte RLS (`set_config`) — docs/adr/0002-multi-tenant-rls.md.
      'no-restricted-properties': [
        'error',
        {
          property: '$queryRawUnsafe',
          message: 'SQL paramétré uniquement : utilisez $queryRaw`…` (contexte RLS).',
        },
        {
          property: '$executeRawUnsafe',
          message: 'SQL paramétré uniquement : utilisez $executeRaw`…` (contexte RLS).',
        },
      ],
    },
  },
  {
    // Dette technique TD-001 (docs/dette-technique.md) : mappers legacy typés `any`
    // en attendant leur typage Prisma.*GetPayload. Ne pas étendre à de nouveaux fichiers.
    files: ['src/trpc/routers/**', 'src/services/accounting.service.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
  {
    // Mocks Prisma profonds : `any` légitime dans les helpers/specs de test.
    files: ['test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-properties': 'off',
    },
  },
);

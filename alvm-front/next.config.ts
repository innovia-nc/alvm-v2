import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // L'image Docker (Coolify / srv-ovh, staging srv-innovia) pose
  // NEXT_OUTPUT=standalone au build pour produire `.next/standalone`.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Monorepo pnpm : traçage des dépendances depuis la racine du dépôt.
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Sources TypeScript partagées (`packages/shared`), compilées par Next.
  transpilePackages: ['@alvm/shared'],
  //
  // Pas de bloc `images` : aucun composant n'importe `next/image`.
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};

export default nextConfig;

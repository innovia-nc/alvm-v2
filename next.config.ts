import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Vercel handles output automatically — no 'standalone' needed
  //
  // Pas de bloc `images` : aucun composant n'importe `next/image`. Les seules
  // images du produit sont le logo de l'association (balise `<img>` dans
  // `components/ui/image-upload.tsx`) et les logos des PDF, rendus par
  // `Image` de `@react-pdf/renderer` — ni l'un ni l'autre ne passe par le
  // pipeline d'optimisation de Next.
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

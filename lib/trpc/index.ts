// Barrel *serveur* : il ré-exporte `createServerTRPC`, qui instancie les routers
// en direct (Prisma, NextAuth). Le proxy client `trpc` n'y figure volontairement
// pas — les 70 composants clients l'importent depuis `@/lib/trpc/client`, et le
// ré-exporter ici suffirait à faire entrer le code serveur dans un bundle client.
export { TRPCProvider } from './provider';
export { createServerTRPC } from './server';

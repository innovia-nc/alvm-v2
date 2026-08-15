/**
 * Barrel tRPC — surface SERVEUR + provider racine uniquement.
 *
 * Le client React (`trpc`) n'est volontairement PAS réexporté ici : les 70
 * composants qui en ont besoin l'importent depuis `@/lib/trpc/client`. Le
 * réexporter remettrait `@trpc/react-query` dans le graphe de tout Server
 * Component qui importe `createServerTRPC` depuis ce barrel.
 */
export { TRPCProvider } from './provider';
export { createServerTRPC } from './server';

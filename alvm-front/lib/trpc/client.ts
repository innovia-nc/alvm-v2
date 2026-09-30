import { createTRPCReact } from '@trpc/react-query';
import { type AppRouter } from '@alvm/back/trpc';

export const trpc = createTRPCReact<AppRouter>();

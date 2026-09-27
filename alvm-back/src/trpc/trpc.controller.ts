import { All, Controller, Req, Res } from '@nestjs/common';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Request, Response } from 'express';
import { sendFetchResponse, toFetchRequest } from '@back/common/fetch-bridge';
import { createContext } from './trpc.context';
import { appRouter } from './trpc.router';

/**
 * Point d'entrée tRPC (`/api/trpc/*`), délégué à l'adaptateur Fetch
 * (CLAUDE.md InnovIA §5.3). Les procédures s'exécutent dans la transaction
 * RLS de leur tenant (voir `trpc.init.ts`).
 */
@Controller('trpc')
export class TrpcController {
  @All('*path')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const response = await fetchRequestHandler({
      endpoint: '/api/trpc',
      req: toFetchRequest(req),
      router: appRouter,
      createContext: () => createContext(req.headers),
      onError({ error, path }) {
        if (error.code === 'INTERNAL_SERVER_ERROR')
          console.error(`[trpc] ${path ?? '?'} :`, error.cause ?? error);
      },
    });
    await sendFetchResponse(res, response);
  }
}

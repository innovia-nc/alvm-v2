import { Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { clientIp } from '@back/auth/request-auth';
import { readJsonBody } from '@back/common/fetch-bridge';
import { isSessionValid, verifyCredentials } from '@back/services/auth.service';
import type { UserRole } from '@back/trpc/trpc.context';

/**
 * Authentification pour le front (NextAuth) : le front ne touche jamais la
 * base (CLAUDE.md InnovIA §5.4). Réservé au front par le secret interne
 * (middleware global, `app.module.ts`) ; jamais exposé publiquement.
 */
@Controller('internal/auth')
export class InternalAuthController {
  /** Vérifie des identifiants. 401 muet pour tout refus. */
  @Post('credentials')
  @HttpCode(200)
  async credentials(@Req() req: Request, @Res() res: Response) {
    const body = await readJsonBody(req).catch(() => null);
    const user = await verifyCredentials(body, clientIp(req.headers));
    if (!user) res.status(401).json({ error: 'Identifiants refusés' });
    else res.json(user);
  }

  /** Une session JWT est-elle toujours valable ? */
  @Post('session')
  @HttpCode(200)
  async session(@Req() req: Request, @Res() res: Response) {
    const body = (await readJsonBody(req).catch(() => null)) as Record<string, unknown> | null;
    const valid =
      !!body &&
      typeof body.id === 'string' &&
      typeof body.organizationId === 'string' &&
      typeof body.sessionVersion === 'number' &&
      typeof body.role === 'string' &&
      (await isSessionValid({
        id: body.id,
        organizationId: body.organizationId,
        sessionVersion: body.sessionVersion,
        role: body.role as UserRole,
      }).catch(() => false));
    res.json({ valid });
  }
}

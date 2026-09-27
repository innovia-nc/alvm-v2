import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { sendFetchResponse, toFetchRequest } from '@back/common/fetch-bridge';
import { handleHealth } from '@back/http/health.handler';

/** Sonde de déploiement : liveness par défaut, readiness base avec `?db=1`. */
@Controller('health')
export class HealthController {
  @Get()
  async health(@Req() req: Request, @Res() res: Response) {
    await sendFetchResponse(res, await handleHealth(toFetchRequest(req)));
  }
}

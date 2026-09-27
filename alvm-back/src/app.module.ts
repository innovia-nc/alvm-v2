import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { hasInternalSecret } from '@back/auth/request-auth';
import { DocumentsModule } from '@back/modules/documents/documents.module';
import { EmailQueueModule } from '@back/modules/email-queue/email-queue.module';
import { HealthModule } from '@back/modules/health/health.module';
import { InternalAuthModule } from '@back/modules/internal-auth/internal-auth.module';
import { UploadsModule } from '@back/modules/uploads/uploads.module';
import { TrpcModule } from '@back/trpc/trpc.module';

/**
 * Seul le front parle au back : toute requête (sauf la sonde de santé) doit
 * porter le secret interne. Le back n'a pas de domaine public (réseau Docker).
 */
function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  if (req.originalUrl.split('?')[0] === '/api/health' || hasInternalSecret(req.headers))
    return next();
  res.status(403).json({ error: 'Accès réservé au front de la plateforme' });
}

@Module({
  imports: [
    HealthModule,
    TrpcModule,
    DocumentsModule,
    UploadsModule,
    InternalAuthModule,
    EmailQueueModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requireInternalSecret).forRoutes('*');
  }
}

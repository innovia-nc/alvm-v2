import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { hasInternalSecret } from '@back/auth/request-auth';
import { DocumentsModule } from '@back/modules/documents/documents.module';
import { EmailQueueModule } from '@back/modules/email-queue/email-queue.module';
import { HealthModule } from '@back/modules/health/health.module';
import { InternalAuthModule } from '@back/modules/internal-auth/internal-auth.module';
import { UploadsModule } from '@back/modules/uploads/uploads.module';
import { TrpcModule } from '@back/trpc/trpc.module';

/** Plus gros corps légitime : un PDF de 5 Mo en multipart (le front borne déjà à 6 Mo). */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

/**
 * Les handlers lisent les corps en entier : un corps doit annoncer sa taille
 * (le relais du front l'envoie toujours) et rester sous la borne. Pas d'écoute
 * du flux ici : elle le consommerait avant les handlers.
 */
function limitBodySize(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const length = req.headers['content-length'];
  if (length === undefined && req.headers['transfer-encoding']) {
    res.status(411).json({ error: 'Taille de requête requise' });
    return;
  }
  if (Number(length ?? '0') > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Requête trop volumineuse' });
    return;
  }
  next();
}

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
    consumer.apply(requireInternalSecret, limitBodySize).forRoutes('*');
  }
}

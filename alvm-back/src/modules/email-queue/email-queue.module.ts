import { Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { closeEmailQueue } from '@back/queues/email.queue';

/** Ferme la connexion Redis du producteur `alvm-email` à l'arrêt de l'API. */
@Injectable()
class EmailQueueShutdown implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await closeEmailQueue();
  }
}

@Module({ providers: [EmailQueueShutdown] })
export class EmailQueueModule {}

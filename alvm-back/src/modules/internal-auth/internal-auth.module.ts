import { Module } from '@nestjs/common';
import { InternalAuthController } from './internal-auth.controller';

@Module({ controllers: [InternalAuthController] })
export class InternalAuthModule {}

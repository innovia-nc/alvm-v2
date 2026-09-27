import { Module } from '@nestjs/common';
import { TrpcController } from './trpc.controller';

@Module({ controllers: [TrpcController] })
export class TrpcModule {}

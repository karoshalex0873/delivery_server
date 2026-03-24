import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { LocationController } from './location.controller';
import { LocationGateway } from './location.gateway';
import { LocationService } from './location.service';

@Module({
  imports: [PrismaModule],
  controllers: [LocationController],
  providers: [LocationService, LocationGateway],
  exports: [LocationService],
})
export class LocationModule {}

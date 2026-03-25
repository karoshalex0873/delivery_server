import { Module } from '@nestjs/common';
import { LocationModule } from 'src/location/location.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [PrismaModule, LocationModule],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { LocationModule } from 'src/location/location.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RoleGuard } from 'src/role/role.guard';
import { RiderController } from './rider.controller';
import { RiderService } from './rider.service';

@Module({
  imports: [AuthModule, PrismaModule, LocationModule],
  controllers: [RiderController],
  providers: [RiderService, RoleGuard],
  exports: [RiderService],
})
export class RiderModule {}

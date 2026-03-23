import { Module } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { AuthModule } from 'src/auth/auth.module';
import { RoleGuard } from 'src/role/role.guard';

@Module({
  imports: [AuthModule],
  providers: [RestaurantService, RoleGuard],
  controllers: [RestaurantController],
  exports: [RestaurantService],
})
export class RestaurantModule {}

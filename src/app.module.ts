import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { UserModule } from './user/user.module';

@Module({

  imports: [
    PrismaModule,
    AuthModule,
    RestaurantModule,
    UserModule
  ],
})
export class AppModule { }

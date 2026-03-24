import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { UserModule } from './user/user.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentModule } from './payment/payment.module';
import { RiderModule } from './rider/rider.module';

@Module({

  imports: [
    PrismaModule,
    AuthModule,
    RestaurantModule,
    UserModule,
    OrdersModule,
    PaymentModule,
    RiderModule
  ],
})
export class AppModule { }

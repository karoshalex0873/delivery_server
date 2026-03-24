import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { Roles } from 'src/role/roles.decorator';
import type { UserRequest } from 'src/types';
import { DarajaStkCallbackDto, InitiateStkPushDto } from './dto';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('customer')
  @Post('daraja/stk-push')
  initiateStkPush(@Req() req: UserRequest, @Body() dto: InitiateStkPushDto) {
    return this.paymentService.initiateStkPush(req.user.sub, dto);
  }

  @Post('daraja/callback')
  @HttpCode(200)
  async handleDarajaCallback(@Body() payload: DarajaStkCallbackDto) {
    await this.paymentService.handleDarajaCallback(payload);

    return {
      ResultCode: 0,
      ResultDesc: 'Accepted',
    };
  }
}

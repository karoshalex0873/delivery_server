import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { UpsertLocationDto } from 'src/location/dto';
import { RoleGuard } from 'src/role/role.guard';
import { Roles } from 'src/role/roles.decorator';
import type { UserRequest } from 'src/types';
import { RiderActivityDto, RiderAvailabilityDto, RiderOffersQueryDto, RiderOrderParamDto, RiderShippingRateDto } from './dto';
import { RiderService } from './rider.service';

@Controller('rider')
export class RiderController {
  constructor(private readonly riderService: RiderService) {}

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Get('me')
  getMe(@Req() req: UserRequest) {
    return this.riderService.getMe(req.user.sub);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Patch('me/availability')
  setAvailability(@Req() req: UserRequest, @Body() dto: RiderAvailabilityDto) {
    return this.riderService.setAvailability(req.user.sub, dto.status);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Patch('me/activity')
  setActivity(@Req() req: UserRequest, @Body() dto: RiderActivityDto) {
    return this.riderService.setActivity(req.user.sub, dto.availabilityStatus);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Patch('me/shipping-rate')
  setShippingRate(@Req() req: UserRequest, @Body() dto: RiderShippingRateDto) {
    return this.riderService.setShippingRate(req.user.sub, dto.costPerKm);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Post('me/location')
  upsertMyLocation(@Req() req: UserRequest, @Body() dto: UpsertLocationDto) {
    return this.riderService.upsertMyLocation(req.user.sub, dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Get('me/order-offers')
  getMyOrderOffers(@Req() req: UserRequest, @Query() query: RiderOffersQueryDto) {
    return this.riderService.getMyOrderOffers(req.user.sub, query);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Get('me/assigned-orders')
  getMyAssignedOrders(@Req() req: UserRequest) {
    return this.riderService.getMyAssignedOrders(req.user.sub);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Post('orders/:orderId/accept')
  acceptOrder(@Req() req: UserRequest, @Param() params: RiderOrderParamDto) {
    return this.riderService.acceptOrder(req.user.sub, params.orderId);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Post('orders/:orderId/pass')
  passOrder(@Req() req: UserRequest, @Param() params: RiderOrderParamDto) {
    return this.riderService.passOrder(req.user.sub, params.orderId);
  }
}


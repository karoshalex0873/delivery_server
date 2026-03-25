import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { Roles } from 'src/role/roles.decorator';
import type { UserRequest } from 'src/types';
import { CreateOrderDto, OrderIdParamDto, UpdateOrderStatusDto } from './dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('customer')
  @Get('catalog')
  getCatalog() {
    return this.ordersService.getCatalog();
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('customer')
  @Get('me')
  getMyOrders(@Req() req: UserRequest) {
    return this.ordersService.getOrdersByCustomerId(req.user.sub);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('customer')
  @Post('checkout')
  checkout(@Req() req: UserRequest, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(req.user.sub, dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Patch(':id/status')
  updateStatus(
    @Req() req: UserRequest,
    @Param() params: OrderIdParamDto,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatusByRestaurantUserId(req.user.sub, params.id, dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Patch(':id/restaurant/accept')
  restaurantAccept(@Req() req: UserRequest, @Param() params: OrderIdParamDto) {
    return this.ordersService.restaurantAcceptOrder(req.user.sub, params.id);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Patch(':id/restaurant/ready')
  restaurantReady(@Req() req: UserRequest, @Param() params: OrderIdParamDto) {
    return this.ordersService.restaurantMarkReady(req.user.sub, params.id);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Patch(':id/restaurant/sign-delivery-start')
  restaurantSignDeliveryStart(@Req() req: UserRequest, @Param() params: OrderIdParamDto) {
    return this.ordersService.restaurantSignDeliveryStart(req.user.sub, params.id);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('rider')
  @Patch(':id/rider/sign-delivery-start')
  riderSignDeliveryStart(@Req() req: UserRequest, @Param() params: OrderIdParamDto) {
    return this.ordersService.riderSignDeliveryStart(req.user.sub, params.id);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('customer')
  @Patch(':id/customer/confirm-delivered')
  customerConfirmDelivered(@Req() req: UserRequest, @Param() params: OrderIdParamDto) {
    return this.ordersService.customerConfirmDelivered(req.user.sub, params.id);
  }
}

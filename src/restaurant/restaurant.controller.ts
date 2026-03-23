import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { Roles } from 'src/role/roles.decorator';
import { RestaurantService } from './restaurant.service';
import { CreateMenuItemDto, CreateRestaurantDto, CreateRestaurantForUserDto, MenuItemIdParamDto, RestaurantIdParamDto, RestaurantMenuParamsDto, UpdateMenuItemDto, UpdateRestaurantDto } from './dto';
import type { UserRequest } from 'src/types';

@Controller('restaurant')
export class RestaurantController {
  constructor(
    private restaurantService: RestaurantService
  ) { }

  // Admin-only endpoint to create a restaurant for a specific user
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Post('admin/create')
  createRestaurantForUser(@Body() dto: CreateRestaurantForUserDto) {
    return this.restaurantService.createRestaurantForUser(dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Post('me')
  createMyRestaurant(@Req() req: UserRequest, @Body() dto: CreateRestaurantDto) {
    return this.restaurantService.createRestaurantByUserId(req.user.sub, dto);
  }

  // Public endpoint to get all restaurants with their menu items
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get('all')
  getAllRestaurants() {
    return this.restaurantService.getAllRestaurants();
  }

  // Endpoint for restaurant owners to get their own restaurant details
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Get('me')
  getMyRestaurant(@Req() req: UserRequest) {
    return this.restaurantService.getRestaurantByUserId(req.user.sub);
  }

  // Admin endpoint to get any restaurant by its ID
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get(':id')
  getRestaurantById(@Param() params: RestaurantIdParamDto) {
    const { id } = params;
    return this.restaurantService.getRestaurantById(id);
  }

  // Endpoint for restaurant owners to update their own restaurant details
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Patch('me')
  updateMyRestaurant(@Req() req: UserRequest, @Body() dto: UpdateRestaurantDto) {
    return this.restaurantService.updateRestaurantByUserId(req.user.sub, dto);
  }
  //  Admin endpoint to update any restaurant by its ID
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Patch(':id')
  updateRestaurant(@Param() params: RestaurantIdParamDto, @Body() dto: UpdateRestaurantDto) {
    const { id } = params;
    return this.restaurantService.updateRestaurantById(id, dto);
  }

  // Admin endpoint to delete a restaurant by its ID
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Delete(':id')
  deleteRestaurant(@Param() params: RestaurantIdParamDto) {
    const { id } = params;
    return this.restaurantService.deleteRestaurantById(id);
  }

  // Endpoints for restaurant owners to manage their menu items
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Post('me/menu-items')
  createMyMenuItem(@Req() req: UserRequest, @Body() dto: CreateMenuItemDto) {
    return this.restaurantService.createMenuItemByUserId(req.user.sub, dto);
  }

  // Endpoint for restaurant owners to get their own menu items
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Get('me/menu-items')
  getMyMenuItems(@Req() req: UserRequest) {
    return this.restaurantService.getMyMenuItems(req.user.sub);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Get('me/orders')
  getMyOrders(@Req() req: UserRequest) {
    return this.restaurantService.getMyOrders(req.user.sub);
  }

  // Endpoint for restaurant owners to update their own menu item
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Patch('me/menu-items/:id')
  updateMyMenuItem(
    @Req() req: UserRequest,
    @Param() params: MenuItemIdParamDto,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.restaurantService.updateMenuItemByUserId(req.user.sub, params.id, dto);
  }
  // Endpoint for restaurant owners to delete their own menu item
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('restaurant')
  @Delete('me/menu-items/:id')
  deleteMyMenuItem(@Req() req: UserRequest, @Param() params: MenuItemIdParamDto) {
    return this.restaurantService.deleteMenuItemByUserId(req.user.sub, params.id);
  }
  // Admin endpoints to manage menu items for any restaurant
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get(':restaurantId/menu-items')
  getRestaurantMenuItems(@Param() params: RestaurantMenuParamsDto) {
    return this.restaurantService.getMenuItemsByRestaurantId(params.restaurantId);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get(':restaurantId/orders')
  getRestaurantOrders(@Param() params: RestaurantMenuParamsDto) {
    return this.restaurantService.getOrdersByRestaurantId(params.restaurantId);
  }

  // Admin endpoint to create a menu item for a specific restaurant
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Post(':restaurantId/menu-items')
  createRestaurantMenuItem(@Param() params: RestaurantMenuParamsDto, @Body() dto: CreateMenuItemDto) {
    return this.restaurantService.createMenuItemByRestaurantId(params.restaurantId, dto);
  }
  // Admin endpoint to update a menu item for a specific restaurant
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Patch(':restaurantId/menu-items/:menuItemId')
  updateRestaurantMenuItem(@Param() params: RestaurantMenuParamsDto, @Body() dto: UpdateMenuItemDto) {
    return this.restaurantService.updateMenuItemByRestaurantId(params.restaurantId, params.menuItemId!, dto);
  }

  // Admin endpoint to delete a menu item for a specific restaurant
  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Delete(':restaurantId/menu-items/:menuItemId')
  deleteRestaurantMenuItem(@Param() params: RestaurantMenuParamsDto) {
    return this.restaurantService.deleteMenuItemByRestaurantId(params.restaurantId, params.menuItemId!);
  }
}

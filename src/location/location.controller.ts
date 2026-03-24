import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import type { UserRequest } from 'src/types';
import { LocationService } from './location.service';
import { NearbyByUserQueryDto, NearbyRidersQueryDto, UpsertLocationDto } from './dto';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post('riders/:riderId')
  upsertRiderLocation(@Param('riderId') riderId: string, @Body() dto: UpsertLocationDto) {
    return this.locationService.upsertRiderLocation(riderId, dto);
  }

  @UseGuards(AuthGuard)
  @Post('users/me')
  upsertMyUserLocation(@Req() req: UserRequest, @Body() dto: UpsertLocationDto) {
    return this.locationService.upsertUserLocation(req.user.sub, dto);
  }

  @Post('restaurants/:restaurantId')
  upsertRestaurantLocation(@Param('restaurantId') restaurantId: string, @Body() dto: UpsertLocationDto) {
    return this.locationService.upsertRestaurantLocation(restaurantId, dto);
  }

  @Post('users/:userId')
  upsertUserLocation(@Param('userId') userId: string, @Body() dto: UpsertLocationDto) {
    return this.locationService.upsertUserLocation(userId, dto);
  }

  @Get('riders/nearby')
  getNearbyRiders(@Query() query: NearbyRidersQueryDto) {
    return this.locationService.getNearbyRiders(query);
  }

  @Get('users/:userId/nearby-riders')
  getNearbyRidersForUser(@Param('userId') userId: string, @Query() query: NearbyByUserQueryDto) {
    return this.locationService.getNearbyRidersForUser(userId, query);
  }
}

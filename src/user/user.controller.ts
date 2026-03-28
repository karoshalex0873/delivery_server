import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { Roles } from 'src/role/roles.decorator';
import type { UserRequest } from 'src/types';
import { CreateAdminUserDto, UpdateAdminUserDto, UserQueryDto } from './dto';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get('admin/starts')
  getAdminStartsAlias() {
    return this.userService.getAdminDashboardStats();
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get('admin/stats')
  getAdminStatsAlias() {
    return this.userService.getAdminDashboardStats();
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get('dashboard-stats')
  getAdminDashboardStatsAlias() {
    return this.userService.getAdminDashboardStats();
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get('admin/dashboard-stats')
  getAdminDashboardStats() {
    return this.userService.getAdminDashboardStats();
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get()
  getUsers(@Query() query: UserQueryDto) {
    return this.userService.getUsers(query);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Post('admin')
  createUserByAdmin(@Body() dto: CreateAdminUserDto) {
    return this.userService.createUserByAdmin(dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Patch('admin/:id')
  updateUserByAdmin(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.userService.updateUserByAdmin(id, dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Delete('admin/:id')
  deleteUserByAdmin(@Req() req: UserRequest, @Param('id') id: string) {
    return this.userService.deleteUserByAdmin(id, req.user.sub);
  }
}

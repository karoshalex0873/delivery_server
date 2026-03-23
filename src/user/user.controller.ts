import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { Roles } from 'src/role/roles.decorator';
import { UserQueryDto } from './dto';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @UseGuards(AuthGuard, RoleGuard)
  @Roles('admin')
  @Get()
  getUsers(@Query() query: UserQueryDto) {
    return this.userService.getUsers(query);
  }
}

import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleSignInDto, SignInDto, SignUpDto, UpdateProfileDto } from './dto';
import type { UserRequest } from 'src/types';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService
  ) { }
  // TODO: Implement authentication endpoints (e.g., login, register)
  // 1. Register(signup): Create a new user with hashed password
  @Post('signup')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }


  // 2. Login(signin): Validate user credentials and return a JWT token
  @Post('signin')
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }

  @Post('signin/google')
  googleSignIn(@Body() dto: GoogleSignInDto) {
    return this.authService.googleSignIn(dto);
  }

  // 3.Logout:
  @Post('logout')
  logout() {
    return this.authService.logout();
  }


  // 4. Password reset,
  @Post('reset-password')
  resetPassword() {
    return this.authService.resetPassword();
  }

  // 5 get current user info (optional)
  @UseGuards(AuthGuard)
  @Post('me')
  getCurrentUser(@Req() req: UserRequest) {
    return this.authService.getCurrentUser(req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Post('me/update')
  updateCurrentUser(@Req() req: UserRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateCurrentUser(req.user.sub, dto);
  }

}

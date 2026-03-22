import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SignInDto, SignUpDto } from './dto';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) { }

  async signUp(dto: SignUpDto) {
    // 1. Check if the confirmPassword matches the password
    if (dto.confirmPassword && dto.password !== dto.confirmPassword) {
      throw new ConflictException('Passwords do not match');
    }
    // 2. Ensure role is provided if
    if (!dto.roleId) {
      throw new BadRequestException('roleId is required');
    }
    // 3. Check if phone number is already registered
    const existingUser = await this.prisma.user.findFirst({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (existingUser) {
      throw new ConflictException('Phone number already in use');
    }
    // 2. Hash the password using argon2
    const hashedPassword = await argon2.hash(dto.password);
    // 1. Create a new user in the database with the hashed password
    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        password: hashedPassword,
        roleId: dto.roleId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        roleId: true,
      }
    });
    return user;
  }

  async signIn(dto: SignInDto) {
    // TODO: Implement sign-in logic (validate credentials, generate JWT token)

    // 1. Find the user by phone number
    const userExist = await this.prisma.user.findFirst({
      where: { phoneNumber: dto.phoneNumber },
    });
    // 2. If user not found, throw an error
    if (!userExist) {
      throw new NotFoundException('invalid phone number or password');
    }
    if (!userExist.password) {
      throw new NotFoundException('Invalid phone number or password');
    }
    // 3. Verify the password using argon2 if they match, if not throw an error
    const passwordMatch = await argon2.verify(userExist.password, dto.password);

    // 4. Ifsword password is incorrect, throw an error
    if (!passwordMatch) {
      throw new NotFoundException('Invalid phone number or password');
    }
    // 5. Generate access and refresh tokens (JWT) and return them to the client
    const accessToken = await this.jwtService.signAsync({
      sub: userExist.id,
      roleId: userExist.roleId,
    });

    return {
      accessToken,
      roleId: userExist.roleId,
    };
  }

  logout() {
    return {
      message: 'Logout successful. Remove the stored access token on the client.',
    };
  }

  resetPassword() { 
    // TODO: Implement password reset logic (e.g., send reset email, update password in database)
  }

  async getCurrentUser(userId?: string) {
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        roleId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

}

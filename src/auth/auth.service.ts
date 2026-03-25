import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GoogleSignInDto, SignInDto, SignUpDto, UpdateProfileDto } from './dto';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) { }

  async signUp(dto: SignUpDto) {
    if (dto.confirmPassword && dto.password !== dto.confirmPassword) {
      throw new ConflictException('Passwords do not match');
    }

    const existingByEmail = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingByEmail) {
      throw new ConflictException('Email already in use');
    }

    if (dto.phoneNumber) {
      const existingByPhone = await this.prisma.user.findFirst({
        where: { phoneNumber: dto.phoneNumber },
      });

      if (existingByPhone) {
        throw new ConflictException('Phone number already in use');
      }
    }

    const hashedPassword = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.toLowerCase(),
        phoneNumber: dto.phoneNumber,
        password: hashedPassword,
        roleId: 1,
        authProvider: 'local',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        roleId: true,
      },
    });
    return user;
  }

  async signIn(dto: SignInDto) {
    const userExist = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
      include: {
        role: {
          select: { name: true },
        },
      },
    });
    if (!userExist) {
      throw new NotFoundException('Invalid email or password');
    }
    if (!userExist.password) {
      throw new NotFoundException('Invalid email or password');
    }
    const passwordMatch = await argon2.verify(userExist.password, dto.password);

    if (!passwordMatch) {
      throw new NotFoundException('Invalid email or password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: userExist.id,
      role: userExist.role.name,
      roleId: userExist.roleId,
    });

    return {
      accessToken,
      roleId: userExist.roleId,
    };
  }

  async googleSignIn(dto: GoogleSignInDto) {
    const email = dto.email.toLowerCase();

    if (dto.phoneNumber) {
      const existingPhone = await this.prisma.user.findFirst({
        where: {
          phoneNumber: dto.phoneNumber,
          NOT: { email },
        },
      });

      if (existingPhone) {
        throw new ConflictException('Phone number already in use by another account');
      }
    }

    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        firstName: dto.firstName ?? 'Google',
        lastName: dto.lastName ?? 'User',
        email,
        phoneNumber: dto.phoneNumber,
        password: null,
        googleId: dto.googleId ?? null,
        authProvider: 'google',
        roleId: 1,
      },
      update: {
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        phoneNumber: dto.phoneNumber ?? undefined,
        googleId: dto.googleId ?? undefined,
        authProvider: 'google',
        roleId: 1,
      },
      include: {
        role: {
          select: { name: true },
        },
      },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role.name,
      roleId: user.roleId,
    });

    return {
      accessToken,
      roleId: user.roleId,
      authProvider: user.authProvider,
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
        email: true,
        phoneNumber: true,
        authProvider: true,
        roleId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateCurrentUser(userId: string | undefined, dto: UpdateProfileDto) {
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phoneNumber: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const email = dto.email?.toLowerCase();

    if (email && email !== existingUser.email) {
      const emailOwner = await this.prisma.user.findFirst({
        where: {
          email,
          NOT: { id: userId },
        },
        select: { id: true },
      });

      if (emailOwner) {
        throw new ConflictException('Email already in use');
      }
    }

    if (dto.phoneNumber && dto.phoneNumber !== existingUser.phoneNumber) {
      const phoneOwner = await this.prisma.user.findFirst({
        where: {
          phoneNumber: dto.phoneNumber,
          NOT: { id: userId },
        },
        select: { id: true },
      });

      if (phoneOwner) {
        throw new ConflictException('Phone number already in use');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName?.trim() || undefined,
        lastName: dto.lastName?.trim() || undefined,
        email,
        phoneNumber: dto.phoneNumber?.trim() || null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        authProvider: true,
        roleId: true,
      },
    });

    return updatedUser;
  }

}

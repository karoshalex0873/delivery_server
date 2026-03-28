import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAdminUserDto, UpdateAdminUserDto, UserQueryDto } from './dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  getUsers(query: UserQueryDto) {
    const where: Record<string, unknown> = {};

    if (query.role) {
      where.role = { name: query.role };
    }

    if (query.available) {
      where.restaurant = { is: null };
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        roleId: true,
        role: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        firstName: 'asc',
      },
    });
  }

  async getAdminDashboardStats() {
    const today = new Date();
    const [restaurantsCount, customersCount, ridersCount, activeRidersCount, ratingAgg] = await Promise.all([
      this.prisma.restaurant.count(),
      this.prisma.user.count({
        where: {
          role: {
            name: 'customer',
          },
        },
      }),
      this.prisma.rider.count(),
      this.prisma.rider.count({
        where: {
          status: 'online',
          availabilityStatus: 'active',
        },
      }),
      this.prisma.restaurant.aggregate({
        _avg: {
          rating: true,
        },
      }),
    ]);

    return {
      dateToday: today.toISOString(),
      starsAverage: Number((ratingAgg._avg.rating ?? 0).toFixed(1)),
      restaurantsCount,
      customersCount,
      ridersCount,
      activeRidersCount,
    };
  }

  async createUserByAdmin(dto: CreateAdminUserDto) {
    const email = dto.email.toLowerCase().trim();

    const existingByEmail = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existingByEmail) {
      throw new ConflictException('Email already in use');
    }

    if (dto.phoneNumber) {
      const existingByPhone = await this.prisma.user.findFirst({
        where: { phoneNumber: dto.phoneNumber.trim() },
        select: { id: true },
      });
      if (existingByPhone) {
        throw new ConflictException('Phone number already in use');
      }
    }

    const passwordToHash = dto.password?.trim() || 'changeme123';
    const hashedPassword = await argon2.hash(passwordToHash);

    return this.prisma.user.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email,
        phoneNumber: dto.phoneNumber?.trim() || null,
        roleId: dto.roleId,
        password: hashedPassword,
        authProvider: 'local',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        email: true,
        roleId: true,
        role: { select: { name: true } },
      },
    });
  }

  async updateUserByAdmin(id: string, dto: UpdateAdminUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, phoneNumber: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const email = dto.email?.toLowerCase().trim();
    if (email && email !== existing.email) {
      const emailOwner = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
        select: { id: true },
      });
      if (emailOwner) {
        throw new ConflictException('Email already in use');
      }
    }

    const phoneNumber = dto.phoneNumber?.trim();
    if (phoneNumber && phoneNumber !== existing.phoneNumber) {
      const phoneOwner = await this.prisma.user.findFirst({
        where: { phoneNumber, NOT: { id } },
        select: { id: true },
      });
      if (phoneOwner) {
        throw new ConflictException('Phone number already in use');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        email,
        phoneNumber: phoneNumber || undefined,
        roleId: dto.roleId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        email: true,
        roleId: true,
        role: { select: { name: true } },
      },
    });
  }

  async deleteUserByAdmin(id: string, currentAdminUserId?: string) {
    if (!currentAdminUserId) {
      throw new BadRequestException('Admin user is required');
    }
    if (id === currentAdminUserId) {
      throw new BadRequestException('You cannot delete your own admin account');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id },
    });
    return { ok: true };
  }
}

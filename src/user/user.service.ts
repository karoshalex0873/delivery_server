import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserQueryDto } from './dto';

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
}

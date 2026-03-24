import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';

@Injectable()
export class OrdersService {
  constructor(private  prisma: PrismaService) {}

  getCatalog() {
    return this.prisma.restaurant.findMany({
      include: {
        menuItems: {
          orderBy: {
            name: 'asc',
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  getOrdersByCustomerId(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: this.orderInclude(),
      orderBy: {
        id: 'desc',
      },
    });
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
      include: {
        menuItems: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const uniqueMenuItemIds = [...new Set(dto.items.map((item) => item.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: uniqueMenuItemIds },
        restaurantId: dto.restaurantId,
      },
    });

    if (menuItems.length !== uniqueMenuItemIds.length) {
      throw new BadRequestException('One or more selected menu items do not belong to this restaurant');
    }

    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
    const mergedItems = dto.items.reduce<Map<string, { menuItemId: string; quantity: number }>>((acc, item) => {
      const existing = acc.get(item.menuItemId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        acc.set(item.menuItemId, {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
        });
      }
      return acc;
    }, new Map());

    const orderItems = [...mergedItems.values()].map((item) => {
      const menuItem = menuItemsById.get(item.menuItemId);

      if (!menuItem) {
        throw new BadRequestException(`Menu item ${item.menuItemId} was not found`);
      }

      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        price: menuItem.price * item.quantity,
      };
    });

    const totalPrice = orderItems.reduce((sum, item) => sum + item.price, 0);

    return this.prisma.order.create({
      data: {
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        totalPrice,
        userId,
        restaurantId: dto.restaurantId,
        orderItems: {
          create: orderItems,
        },
      },
      include: this.orderInclude(),
    });
  }

  async updateOrderStatusByRestaurantUserId(userId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.restaurant.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== 'paid') {
      throw new BadRequestException('This order cannot enter the restaurant workflow until payment is completed');
    }

    if (dto.status === 'awaiting_payment' || dto.status === 'payment_failed') {
      throw new BadRequestException('Restaurant cannot move an order back into payment states');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: dto.status,
      },
      include: this.orderInclude(),
    });
  }

  private orderInclude() {
    return {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
        },
      },
      rider: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          address: true,
          phoneNumber: true,
        },
      },
      orderItems: {
        include: {
          menuItem: true,
        },
      },
    };
  }
  
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationGateway } from 'src/location/location.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private readonly locationGateway: LocationGateway,
  ) {}

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

  async restaurantAcceptOrder(userId: string, orderId: string) {
    const order = await this.ensureRestaurantOrderAccess(userId, orderId);

    if (order.paymentStatus !== 'paid') {
      throw new BadRequestException('Order must be paid before restaurant can accept');
    }

    if (['delivered', 'cancelled', 'rejected'].includes(order.status)) {
      throw new BadRequestException('This order cannot be accepted in its current state');
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'accepted' },
      include: this.orderInclude(),
    });

    await this.locationGateway.emitOrderLifecycleForOrder(order.id, 'Restaurant has accepted your order.');
    return updated;
  }

  async restaurantMarkReady(userId: string, orderId: string) {
    const order = await this.ensureRestaurantOrderAccess(userId, orderId);

    if (order.paymentStatus !== 'paid') {
      throw new BadRequestException('Order must be paid before preparation workflow');
    }

    if (!['accepted', 'preparing', 'ready_for_pickup', 'delivery_sign_restaurant', 'delivery_sign_rider'].includes(order.status)) {
      throw new BadRequestException('Order must be accepted/preparing before marking ready');
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'ready_for_pickup' },
      include: this.orderInclude(),
    });

    await this.locationGateway.emitOrderLifecycleForOrder(order.id, 'Meal is ready for pickup.');
    return updated;
  }

  async restaurantSignDeliveryStart(userId: string, orderId: string) {
    const order = await this.ensureRestaurantOrderAccess(userId, orderId);
    if (!order.riderId) {
      throw new BadRequestException('Assign a rider before starting delivery');
    }

    if (!['ready_for_pickup', 'delivery_sign_rider', 'delivery_sign_restaurant', 'out_for_delivery'].includes(order.status)) {
      throw new BadRequestException('Order is not ready for delivery start signatures');
    }

    const nextStatus = order.status === 'delivery_sign_rider' || order.status === 'out_for_delivery'
      ? 'out_for_delivery'
      : 'delivery_sign_restaurant';

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: nextStatus },
      include: this.orderInclude(),
    });

    await this.locationGateway.emitOrderLifecycleForOrder(
      order.id,
      nextStatus === 'out_for_delivery'
        ? 'Restaurant and rider signed. Delivery has started.'
        : 'Restaurant signed delivery book.',
    );

    return updated;
  }

  async riderSignDeliveryStart(userId: string, orderId: string) {
    const rider = await this.ensureRiderProfileByUserId(userId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.riderId !== rider.id) {
      throw new NotFoundException('Order not found');
    }

    if (!['ready_for_pickup', 'delivery_sign_restaurant', 'delivery_sign_rider', 'out_for_delivery'].includes(order.status)) {
      throw new BadRequestException('Order is not ready for delivery start signatures');
    }

    const nextStatus = order.status === 'delivery_sign_restaurant' || order.status === 'out_for_delivery'
      ? 'out_for_delivery'
      : 'delivery_sign_rider';

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: nextStatus },
      include: this.orderInclude(),
    });

    await this.locationGateway.emitOrderLifecycleForOrder(
      order.id,
      nextStatus === 'out_for_delivery'
        ? 'Restaurant and rider signed. Delivery has started.'
        : 'Rider signed delivery book.',
    );

    return updated;
  }

  async customerConfirmDelivered(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'out_for_delivery') {
      throw new BadRequestException('Order is not yet in delivery stage');
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'delivered' },
      include: this.orderInclude(),
    });

    await this.locationGateway.emitOrderLifecycleForOrder(order.id, 'Customer signed and confirmed delivery.');
    return updated;
  }

  async updateOrderStatusByRestaurantUserId(userId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.ensureRestaurantOrderAccess(userId, orderId);

    if (order.paymentStatus !== 'paid') {
      throw new BadRequestException('This order cannot enter the restaurant workflow until payment is completed');
    }

    if (dto.status === 'awaiting_payment' || dto.status === 'payment_failed') {
      throw new BadRequestException('Restaurant cannot move an order back into payment states');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: dto.status,
      },
      include: this.orderInclude(),
    });

    await this.locationGateway.emitOrderLifecycleForOrder(order.id, `Order updated to ${dto.status.replace(/_/g, ' ')}.`);
    return updated;
  }

  private async ensureRestaurantOrderAccess(userId: string, orderId: string) {
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

    return order;
  }

  private async ensureRiderProfileByUserId(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role.name !== 'rider') {
      throw new BadRequestException('Only rider users can access rider actions');
    }

    const rider = await this.prisma.rider.findFirst({
      where: { phoneNumber: user.phoneNumber || '' },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found');
    }

    return rider;
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


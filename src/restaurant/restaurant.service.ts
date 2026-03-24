import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMenuItemDto, CreateRestaurantDto, CreateRestaurantForUserDto, UpdateMenuItemDto, UpdateRestaurantDto } from './dto';

@Injectable()
export class RestaurantService {
  constructor(
    private prisma: PrismaService
  ) { }

  async createRestaurantForUser(dto: CreateRestaurantForUserDto) {
    await this.ensureUserCanOwnRestaurant(dto.userId);
    await this.ensureUserHasNoRestaurant(dto.userId);

    return this.prisma.restaurant.create({
      data: {
        name: dto.name,
        address: dto.address,
        description: dto.description,
        phoneNumber: dto.phoneNumber,
        userId: dto.userId,
      },
      include: this.restaurantInclude(),
    });
  }

  async createRestaurantByUserId(userId: string, dto: CreateRestaurantDto) {
    await this.ensureUserCanOwnRestaurant(userId);
    await this.ensureUserHasNoRestaurant(userId);

    return this.prisma.restaurant.create({
      data: {
        name: dto.name,
        address: dto.address,
        description: dto.description,
        phoneNumber: dto.phoneNumber,
        userId,
      },
      include: this.restaurantInclude(),
    });
  }

  getAllRestaurants() {
    return this.prisma.restaurant.findMany({
      include: this.restaurantInclude(),
      orderBy: {
        name: 'asc',
      },
    });
  }

  async getRestaurantById(id: string) {
    return this.ensureRestaurantExists({ id });
  }

  async getRestaurantByUserId(userId: string) {
    return this.ensureRestaurantExists({ userId });
  }

  async updateRestaurantById(id: string, dto: UpdateRestaurantDto) {
    await this.ensureRestaurantExists({ id });

    return this.prisma.restaurant.update({
      where: { id },
      data: this.buildRestaurantUpdateData(dto),
      include: this.restaurantInclude(),
    });
  }

  async updateRestaurantByUserId(userId: string, dto: UpdateRestaurantDto) {
    const existingRestaurant = await this.ensureRestaurantExists({ userId });

    return this.prisma.restaurant.update({
      where: { id: existingRestaurant.id },
      data: this.buildRestaurantUpdateData(dto),
      include: this.restaurantInclude(),
    });
  }

  async deleteRestaurantById(id: string) {
    await this.ensureRestaurantExists({ id });

    return this.prisma.restaurant.delete({
      where: { id },
    });
  }


  async createMenuItemByRestaurantId(restaurantId: string, dto: CreateMenuItemDto) {
    await this.ensureRestaurantExists({ id: restaurantId });

    return this.prisma.menuItem.create({
      data: {
        name: dto.name,
        price: dto.price,
        restaurantId,
      },
    });
  }

  async createMenuItemByUserId(userId: string, dto: CreateMenuItemDto) {
    const restaurant = await this.ensureRestaurantExists({ userId });

    return this.createMenuItemByRestaurantId(restaurant.id, dto);
  }

  async getMenuItemsByRestaurantId(restaurantId: string) {
    await this.ensureRestaurantExists({ id: restaurantId });

    return this.prisma.menuItem.findMany({
      where: { restaurantId },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async getMyMenuItems(userId: string) {
    const restaurant = await this.ensureRestaurantExists({ userId });
    return this.getMenuItemsByRestaurantId(restaurant.id);
  }

  async getOrdersByRestaurantId(restaurantId: string) {
    await this.ensureRestaurantExists({ id: restaurantId });

    return this.prisma.order.findMany({
      where: {
        restaurantId,
        paymentStatus: 'paid',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        rider: true,
        orderItems: {
          include: {
            menuItem: true,
          },
        },
      },
      orderBy: {
        id: 'desc',
      },
    });
  }

  async getMyOrders(userId: string) {
    const restaurant = await this.ensureRestaurantExists({ userId });
    return this.getOrdersByRestaurantId(restaurant.id);
  }

  async updateMenuItemByRestaurantId(restaurantId: string, menuItemId: string, dto: UpdateMenuItemDto) {
    await this.ensureRestaurantMenuItem(restaurantId, menuItemId);

    return this.prisma.menuItem.update({
      where: { id: menuItemId },
      data: this.buildMenuItemUpdateData(dto),
    });
  }

  async updateMenuItemByUserId(userId: string, menuItemId: string, dto: UpdateMenuItemDto) {
    const menuItem = await this.ensureOwnedMenuItem(userId, menuItemId);

    return this.prisma.menuItem.update({
      where: { id: menuItem.id },
      data: this.buildMenuItemUpdateData(dto),
    });
  }

  async deleteMenuItemByRestaurantId(restaurantId: string, menuItemId: string) {
    await this.ensureRestaurantMenuItem(restaurantId, menuItemId);

    return this.prisma.menuItem.delete({
      where: { id: menuItemId },
    });
  }

  async deleteMenuItemByUserId(userId: string, menuItemId: string) {
    const menuItem = await this.ensureOwnedMenuItem(userId, menuItemId);

    return this.prisma.menuItem.delete({
      where: { id: menuItem.id },
    });
  }

  private async ensureRestaurantExists(where: { id?: string; userId?: string }) {
    if (!where.id && !where.userId) {
      throw new BadRequestException('Restaurant lookup requires id or userId');
    }

    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        ...(where.id ? { id: where.id } : {}),
        ...(where.userId ? { userId: where.userId } : {}),
      },
      include: this.restaurantInclude(),
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    return restaurant;
  }

  private async ensureMenuItemExists(menuItemId: string) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: {
        restaurant: true,
      },
    });

    if (!menuItem) {
      throw new NotFoundException('Menu item not found');
    }

    return menuItem;
  }

  private async ensureOwnedMenuItem(userId: string, menuItemId: string) {
    const menuItem = await this.ensureMenuItemExists(menuItemId);

    if (menuItem.restaurant.userId !== userId) {
      throw new NotFoundException('Menu item not found');
    }

    return menuItem;
  }

  private async ensureRestaurantMenuItem(restaurantId: string, menuItemId: string) {
    const menuItem = await this.ensureMenuItemExists(menuItemId);

    if (menuItem.restaurantId !== restaurantId) {
      throw new NotFoundException('Menu item not found');
    }

    return menuItem;
  }

  private async ensureUserCanOwnRestaurant(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role.name !== 'restaurant') {
      throw new BadRequestException('Only restaurant users can own a restaurant profile');
    }

    return user;
  }

  private async ensureUserHasNoRestaurant(userId: string) {
    const existingRestaurant = await this.prisma.restaurant.findFirst({
      where: { userId },
    });

    if (existingRestaurant) {
      throw new ConflictException('User already has a restaurant profile');
    }
  }

  private buildRestaurantUpdateData(dto: UpdateRestaurantDto) {
    return {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
    };
  }

  private buildMenuItemUpdateData(dto: UpdateMenuItemDto) {
    return {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
    };
  }

  private restaurantInclude() {
    return {
      menuItems: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
        },
      },
    };
  }

}

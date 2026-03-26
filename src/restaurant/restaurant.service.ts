import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LocationService } from 'src/location/location.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMenuItemDto, CreateRestaurantDto, CreateRestaurantForUserDto, UpdateMenuItemDto, UpdateRestaurantDto } from './dto';
import { UpsertLocationDto } from 'src/location/dto';

@Injectable()
export class RestaurantService {
  private readonly logger = new Logger(RestaurantService.name);

  constructor(
    private prisma: PrismaService,
    private locationService: LocationService,
  ) { }

  async createRestaurantForUser(dto: CreateRestaurantForUserDto) {
    await this.ensureUserCanOwnRestaurant(dto.userId);
    await this.ensureUserHasNoRestaurant(dto.userId);

    try {
      return await this.prisma.restaurant.create({
        data: {
          name: dto.name,
          address: dto.address,
          description: dto.description,
          phoneNumber: dto.phoneNumber,
          categories: dto.categories ?? [],
          userId: dto.userId,
        },
        include: this.restaurantInclude(),
      });
    } catch (error) {
      if (this.isUnknownCategoriesArgument(error)) {
        this.logger.warn('Prisma client does not support Restaurant.categories yet. Retrying create without categories.');
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
      throw error;
    }
  }

  async createRestaurantByUserId(userId: string, dto: CreateRestaurantDto) {
    await this.ensureUserCanOwnRestaurant(userId);
    await this.ensureUserHasNoRestaurant(userId);

    try {
      return await this.prisma.restaurant.create({
        data: {
          name: dto.name,
          address: dto.address,
          description: dto.description,
          phoneNumber: dto.phoneNumber,
          categories: dto.categories ?? [],
          userId,
        },
        include: this.restaurantInclude(),
      });
    } catch (error) {
      if (this.isUnknownCategoriesArgument(error)) {
        this.logger.warn('Prisma client does not support Restaurant.categories yet. Retrying create without categories.');
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
      throw error;
    }
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
    const data = this.buildRestaurantUpdateData(dto);
    const dataWithoutCategories = this.buildRestaurantUpdateData(dto, { includeCategories: false });
    try {
      return await this.prisma.restaurant.update({
        where: { id },
        data,
        include: this.restaurantInclude(),
      });
    } catch (error) {
      if (this.isUnknownCategoriesArgument(error)) {
        this.logger.warn(`Prisma client does not support Restaurant.categories yet. Retrying update without categories for restaurant=${id}.`);
        return this.prisma.restaurant.update({
          where: { id },
          data: dataWithoutCategories,
          include: this.restaurantInclude(),
        });
      }
      throw error;
    }
  }

  async updateRestaurantByUserId(userId: string, dto: UpdateRestaurantDto) {
    const existingRestaurant = await this.ensureRestaurantExists({ userId });
    const data = this.buildRestaurantUpdateData(dto);
    const dataWithoutCategories = this.buildRestaurantUpdateData(dto, { includeCategories: false });
    try {
      return await this.prisma.restaurant.update({
        where: { id: existingRestaurant.id },
        data,
        include: this.restaurantInclude(),
      });
    } catch (error) {
      if (this.isUnknownCategoriesArgument(error)) {
        this.logger.warn(
          `Prisma client does not support Restaurant.categories yet. Retrying update without categories for restaurant=${existingRestaurant.id}.`,
        );
        return this.prisma.restaurant.update({
          where: { id: existingRestaurant.id },
          data: dataWithoutCategories,
          include: this.restaurantInclude(),
        });
      }
      throw error;
    }
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
        category: dto.category ?? 'other',
        imageUrl: dto.imageUrl,
        availableCount: dto.availableCount ?? 20,
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

  async getMyOrderUserLocations(userId: string) {
    const restaurant = await this.ensureRestaurantExists({ userId });
    const paidOrders = await this.prisma.order.findMany({
      where: {
        restaurantId: restaurant.id,
        paymentStatus: 'paid',
      },
      select: {
        id: true,
        status: true,
        userId: true,
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
        id: 'desc',
      },
    });

    const userLocations = this.locationService.getUserLocationsByIds(paidOrders.map((order) => order.userId));
    const locationMap = new Map(userLocations.map((item) => [item.userId, item]));

    return paidOrders.map((order) => ({
      orderId: order.id,
      orderStatus: order.status,
      user: order.user,
      location: locationMap.get(order.userId) ?? null,
    }));
  }

  async upsertMyRestaurantLocation(userId: string, dto: UpsertLocationDto) {
    const restaurant = await this.ensureRestaurantExists({ userId });
    return this.locationService.upsertRestaurantLocation(restaurant.id, dto);
  }

  async getMyRestaurantLocation(userId: string) {
    const restaurant = await this.ensureRestaurantExists({ userId });
    return this.locationService.getRestaurantLocation(restaurant.id);
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
    await this.ensureMenuItemCanBeDeleted(menuItemId);

    return this.prisma.menuItem.delete({
      where: { id: menuItemId },
    });
  }

  async deleteMenuItemByUserId(userId: string, menuItemId: string) {
    const menuItem = await this.ensureOwnedMenuItem(userId, menuItemId);
    await this.ensureMenuItemCanBeDeleted(menuItem.id);

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

  private async ensureMenuItemCanBeDeleted(menuItemId: string) {
    const orderItemCount = await this.prisma.orderItem.count({
      where: { menuItemId },
    });

    if (orderItemCount > 0) {
      throw new BadRequestException(
        'This menu item is used in previous orders and cannot be deleted. Set its availableCount to 0 to hide it from customers.',
      );
    }
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

  private buildRestaurantUpdateData(
    dto: UpdateRestaurantDto,
    options?: { includeCategories?: boolean },
  ) {
    const includeCategories = options?.includeCategories ?? true;
    return {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
      ...(includeCategories && dto.categories !== undefined ? { categories: dto.categories } : {}),
    };
  }

  private isUnknownCategoriesArgument(error: unknown) {
    return error instanceof Error && error.message.includes('Unknown argument `categories`');
  }

  private buildMenuItemUpdateData(dto: UpdateMenuItemDto) {
    return {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      ...(dto.availableCount !== undefined ? { availableCount: dto.availableCount } : {}),
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

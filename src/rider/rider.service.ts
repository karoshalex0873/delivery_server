import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationService } from 'src/location/location.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpsertLocationDto } from 'src/location/dto';
import { RiderOffersQueryDto } from './dto';

@Injectable()
export class RiderService {
  private readonly passedOrdersByRider = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationService: LocationService,
  ) {}

  async getMe(userId: string) {
    return this.ensureRiderProfile(userId);
  }

  async setAvailability(userId: string, status: 'online' | 'offline') {
    const rider = await this.ensureRiderProfile(userId);
    return this.prisma.rider.update({
      where: { id: rider.id },
      data: { status },
    });
  }

  async upsertMyLocation(userId: string, dto: UpsertLocationDto) {
    const rider = await this.ensureRiderProfile(userId);
    return this.locationService.upsertRiderLocation(rider.id, dto);
  }

  async getMyOrderOffers(userId: string, query: RiderOffersQueryDto) {
    const rider = await this.ensureRiderProfile(userId);
    if (rider.status !== 'online') {
      throw new BadRequestException('Rider must be online to receive order offers');
    }

    const riderLocation = this.locationService.getRiderLocation(rider.id);
    if (!riderLocation) {
      throw new BadRequestException('Rider location not found. Update rider location first');
    }

    const radiusKm = query.radiusKm ?? 30;
    const limit = query.limit ?? 10;
    const passedOrderIds = this.passedOrdersByRider.get(rider.id) ?? new Set<string>();

    const candidateOrders = await this.prisma.order.findMany({
      where: {
        paymentStatus: 'paid',
        riderId: null,
        status: {
          in: ['pending', 'accepted', 'preparing', 'ready_for_pickup'],
        },
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
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
            phoneNumber: true,
          },
        },
      },
    });

    return candidateOrders
      .filter((order) => !passedOrderIds.has(order.id))
      .map((order) => {
        const restaurantLocation = this.locationService.getRestaurantLocation(order.restaurantId);
        const customerLocation = this.locationService.getUserLocation(order.userId);

        if (!restaurantLocation || !customerLocation) {
          return null;
        }

        const riderToRestaurantKm = this.locationService.distanceKm(riderLocation, restaurantLocation);
        const restaurantToCustomerKm = this.locationService.distanceKm(restaurantLocation, customerLocation);

        return {
          orderId: order.id,
          orderStatus: order.status,
          totalPrice: order.totalPrice,
          riderToRestaurantKm: Number(riderToRestaurantKm.toFixed(2)),
          restaurantToCustomerKm: Number(restaurantToCustomerKm.toFixed(2)),
          restaurant: order.restaurant,
          customer: order.user,
          restaurantLocation,
          customerLocation,
        };
      })
      .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer))
      .filter((offer) => offer.riderToRestaurantKm <= radiusKm)
      .sort((a, b) => a.riderToRestaurantKm - b.riderToRestaurantKm)
      .slice(0, limit);
  }

  async acceptOrder(userId: string, orderId: string) {
    const rider = await this.ensureRiderProfile(userId);
    if (rider.status !== 'online') {
      throw new BadRequestException('Set rider status to online before accepting orders');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== 'paid') {
      throw new BadRequestException('Order is not paid yet');
    }

    if (order.riderId) {
      throw new ConflictException('Order already has a rider');
    }

    const updateResult = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        riderId: null,
      },
      data: {
        riderId: rider.id,
        status: order.status === 'pending' ? 'accepted' : order.status,
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException('Order was assigned before your action completed');
    }

    this.passedOrdersByRider.get(rider.id)?.delete(orderId);

    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        restaurant: true,
        rider: true,
      },
    });
  }

  async passOrder(userId: string, orderId: string) {
    const rider = await this.ensureRiderProfile(userId);
    const passed = this.passedOrdersByRider.get(rider.id) ?? new Set<string>();
    passed.add(orderId);
    this.passedOrdersByRider.set(rider.id, passed);

    return {
      orderId,
      riderId: rider.id,
      message: 'Order skipped for this rider',
    };
  }

  private async ensureRiderProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role.name !== 'rider') {
      throw new BadRequestException('Only rider users can access rider operations');
    }

    let rider = await this.prisma.rider.findFirst({
      where: { phoneNumber: user.phoneNumber },
    });

    if (!rider) {
      rider = await this.prisma.rider.create({
        data: {
          name: `${user.firstName} ${user.lastName}`.trim(),
          phoneNumber: user.phoneNumber,
          status: 'offline',
          address: 'Unknown',
        },
      });
    }

    return rider;
  }
}

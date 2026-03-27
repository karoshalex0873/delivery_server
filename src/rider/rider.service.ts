import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationGateway } from 'src/location/location.gateway';
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
    private readonly locationGateway: LocationGateway,
  ) {}

  async getMe(userId: string) {
    const rider = await this.ensureRiderProfile(userId);
    return {
      ...rider,
      costPerKm: this.locationService.getRiderShippingRatePerKm(rider.id),
    };
  }

  async setAvailability(userId: string, status: 'online' | 'offline') {
    const rider = await this.ensureRiderProfile(userId);
    return this.prisma.rider.update({
      where: { id: rider.id },
      data: { status },
    });
  }

  async setActivity(userId: string, availabilityStatus: 'active' | 'inactive') {
    const rider = await this.ensureRiderProfile(userId);
    return this.prisma.rider.update({
      where: { id: rider.id },
      data: { availabilityStatus },
    });
  }

  async upsertMyLocation(userId: string, dto: UpsertLocationDto) {
    const rider = await this.ensureRiderProfile(userId);
    const location = this.locationService.upsertRiderLocation(rider.id, dto);

    this.locationGateway.emitRiderLocationUpdated(location);

    const activeOrders = await this.prisma.order.findMany({
      where: {
        riderId: rider.id,
        paymentStatus: 'paid',
        status: {
          in: ['accepted', 'preparing', 'ready_for_pickup', 'delivery_sign_restaurant', 'delivery_sign_rider', 'out_for_delivery'],
        },
      },
      select: { id: true },
    });

    for (const order of activeOrders) {
      await this.locationGateway.emitOrderLifecycleForOrder(order.id);
    }

    return location;
  }

  async setShippingRate(userId: string, costPerKm: number) {
    const rider = await this.ensureRiderProfile(userId);
    const normalizedRate = this.locationService.setRiderShippingRatePerKm(rider.id, costPerKm);

    return {
      ...rider,
      costPerKm: normalizedRate,
    };
  }

  async getMyOrderOffers(userId: string, query: RiderOffersQueryDto) {
    const rider = await this.ensureRiderProfile(userId);
    if (rider.status !== 'online') {
      throw new BadRequestException('Rider must be online to receive order offers');
    }
    if (rider.availabilityStatus !== 'active') {
      return [];
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
          in: ['accepted', 'preparing', 'ready_for_pickup'],
        },
      },
      include: {
        orderItems: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
              },
            },
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

    const eligibleRiders = await this.prisma.rider.findMany({
      where: {
        status: 'online',
        availabilityStatus: 'active',
      },
      select: { id: true },
    });
    const riderLocationsById = new Map<string, { latitude: number; longitude: number }>();
    for (const candidateRider of eligibleRiders) {
      const location = this.locationService.getRiderLocation(candidateRider.id);
      if (location) {
        riderLocationsById.set(candidateRider.id, location);
      }
    }

    return candidateOrders
      .filter((order) => !passedOrderIds.has(order.id))
      .map((order) => {
        const storedRestaurantLocation = this.locationService.getRestaurantLocation(order.restaurantId);
        const customerLocation = this.locationService.getUserLocation(order.userId);

        if (!customerLocation) {
          return null;
        }

        const restaurantLocation = storedRestaurantLocation ?? customerLocation;
        const isEstimated = !storedRestaurantLocation;
        // Offer each order only to the nearest eligible rider.
        let nearestRiderId: string | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const [candidateRiderId, candidateRiderLocation] of riderLocationsById.entries()) {
          const distance = this.locationService.distanceKm(candidateRiderLocation, restaurantLocation);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestRiderId = candidateRiderId;
          }
        }
        if (!nearestRiderId || nearestRiderId !== rider.id) {
          return null;
        }

        const riderToRestaurantKm = this.locationService.distanceKm(riderLocation, restaurantLocation);
        const restaurantToCustomerKm = this.locationService.distanceKm(restaurantLocation, customerLocation);

        return {
          orderId: order.id,
          orderStatus: order.status,
          totalPrice: order.totalPrice,
          items: order.orderItems.map((item) => ({
            id: item.menuItemId,
            name: item.menuItem?.name ?? 'Menu Item',
            quantity: item.quantity,
          })),
          riderToRestaurantKm: Number(riderToRestaurantKm.toFixed(2)),
          restaurantToCustomerKm: Number(restaurantToCustomerKm.toFixed(2)),
          restaurant: order.restaurant,
          customer: order.user,
          isEstimated,
          restaurantLocation,
          customerLocation,
        };
      })
      .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer))
      .filter((offer) => offer.riderToRestaurantKm <= radiusKm)
      .sort((a, b) => a.riderToRestaurantKm - b.riderToRestaurantKm)
      .slice(0, limit);
  }

  async getMyAssignedOrders(userId: string) {
    const rider = await this.ensureRiderProfile(userId);
    const orders = await this.prisma.order.findMany({
      where: {
        riderId: rider.id,
        status: {
          in: ['pending', 'accepted', 'ready_for_pickup', 'delivery_sign_restaurant', 'delivery_sign_rider', 'out_for_delivery', 'delivery_signed_by_rider', 'delivered', 'cancelled'],
        },
      },
      include: {
        orderItems: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        restaurant: {
          select: { id: true, name: true, address: true, phoneNumber: true },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, phoneNumber: true },
        },
      },
      orderBy: {
        id: 'desc',
      },
    });

    const riderLocation = this.locationService.getRiderLocation(rider.id);

    return orders.map((order) => {
      const restaurantLocation = this.locationService.getRestaurantLocation(order.restaurantId);
      const customerLocation = this.locationService.getUserLocation(order.userId);

      const riderToPickupKm =
        riderLocation && restaurantLocation
          ? Number(this.locationService.distanceKm(riderLocation, restaurantLocation).toFixed(2))
          : null;
      const pickupToDropoffKm =
        restaurantLocation && customerLocation
          ? Number(this.locationService.distanceKm(restaurantLocation, customerLocation).toFixed(2))
          : null;
      const riderToDropoffKm =
        riderLocation && customerLocation
          ? Number(this.locationService.distanceKm(riderLocation, customerLocation).toFixed(2))
          : null;

      return {
        ...order,
        items: order.orderItems.map((item) => ({
          id: item.menuItemId,
          name: item.menuItem?.name ?? 'Menu Item',
          quantity: item.quantity,
        })),
        riderToPickupKm,
        pickupToDropoffKm,
        riderToDropoffKm,
        restaurantLocation,
        customerLocation,
      };
    });
  }

  async acceptOrder(userId: string, orderId: string) {
    const rider = await this.ensureRiderProfile(userId);
    if (rider.status !== 'online') {
      throw new BadRequestException('Set rider status to online before accepting orders');
    }
    if (rider.availabilityStatus !== 'active') {
      throw new BadRequestException('Set rider to active before accepting orders');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== 'paid') {
      throw new BadRequestException('Order is not paid yet');
    }

    if (!['accepted', 'preparing', 'ready_for_pickup'].includes(order.status)) {
      throw new BadRequestException('Order is not ready for rider assignment yet');
    }

    const storedRestaurantLocation = this.locationService.getRestaurantLocation(order.restaurantId);
    const customerLocation = this.locationService.getUserLocation(order.userId);
    const restaurantLocation = storedRestaurantLocation ?? customerLocation;
    if (!restaurantLocation) {
      throw new BadRequestException('Order location is not available yet');
    }

    const eligibleRiders = await this.prisma.rider.findMany({
      where: {
        status: 'online',
        availabilityStatus: 'active',
      },
      select: { id: true },
    });
    let nearestRiderId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidateRider of eligibleRiders) {
      const candidateLocation = this.locationService.getRiderLocation(candidateRider.id);
      if (!candidateLocation) {
        continue;
      }
      const distance = this.locationService.distanceKm(candidateLocation, restaurantLocation);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestRiderId = candidateRider.id;
      }
    }
    if (!nearestRiderId || nearestRiderId !== rider.id) {
      throw new ConflictException('This order is currently assigned to another nearby rider');
    }

    if (order.riderId) {
      throw new ConflictException('Order already has a rider');
    }

    const updateResult = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        riderId: null,
        paymentStatus: 'paid',
        status: {
          in: ['accepted', 'preparing', 'ready_for_pickup'],
        },
      },
      data: {
        riderId: rider.id,
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException('Order is no longer available for rider assignment');
    }

    this.passedOrdersByRider.get(rider.id)?.delete(orderId);

    await this.locationGateway.emitOrderLifecycleForOrder(orderId, 'A rider was found to deliver your order.');

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
      where: { phoneNumber: user.phoneNumber || '' },
    });

    if (!rider) {
      rider = await this.prisma.rider.create({
        data: {
          name: `${user.firstName} ${user.lastName}`.trim(),
          phoneNumber: user.phoneNumber || '',
          status: 'offline',
          availabilityStatus: 'inactive',
          address: 'Unknown',
        },
      });
    }

    return rider;
  }
}

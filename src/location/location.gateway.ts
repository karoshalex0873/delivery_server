import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { LocationService } from './location.service';

type LocationUpdatePayload = {
  role: 'user' | 'rider';
  id: string;
  latitude: number;
  longitude: number;
};

type RestaurantSubscribePayload = {
  restaurantId: string;
};

type RiderSubscribePayload = {
  riderId: string;
};

@WebSocketGateway({
  cors: {
    origin: [process.env.CLIENT_URL ?? 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  },
})
export class LocationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LocationGateway.name);

  @WebSocketServer()
  private server: Server;

  constructor(
    private readonly locationService: LocationService,
    private readonly prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('location:restaurant:subscribe')
  handleRestaurantSubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: RestaurantSubscribePayload) {
    if (!payload?.restaurantId) {
      return { ok: false, message: 'restaurantId is required' };
    }

    client.join(this.restaurantRoom(payload.restaurantId));
    this.logger.debug(`Socket ${client.id} subscribed to restaurant room ${payload.restaurantId}`);
    return { ok: true, restaurantId: payload.restaurantId };
  }

  @SubscribeMessage('location:rider:subscribe')
  handleRiderSubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: RiderSubscribePayload) {
    if (!payload?.riderId) {
      return { ok: false, message: 'riderId is required' };
    }

    client.join(this.riderRoom(payload.riderId));
    this.logger.debug(`Socket ${client.id} subscribed to rider room ${payload.riderId}`);
    return { ok: true, riderId: payload.riderId };
  }

  @SubscribeMessage('location:update')
  async handleLocationUpdate(@MessageBody() payload: LocationUpdatePayload) {
    if (!payload?.id || !payload?.role) {
      return { ok: false, message: 'id and role are required' };
    }

    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, message: 'latitude and longitude must be numbers' };
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return { ok: false, message: 'Invalid latitude or longitude values' };
    }

    if (payload.role === 'rider') {
      const riderLocation = this.locationService.upsertRiderLocation(payload.id, { latitude, longitude });
      this.server.emit('location:rider:updated', riderLocation);
      return { ok: true, type: 'rider', data: riderLocation };
    }

    const userLocation = this.locationService.upsertUserLocation(payload.id, { latitude, longitude });

    const activeOrders = await this.prisma.order.findMany({
      where: {
        userId: payload.id,
        paymentStatus: 'paid',
      },
      select: {
        id: true,
        restaurantId: true,
      },
    });

    for (const order of activeOrders) {
      this.server.to(this.restaurantRoom(order.restaurantId)).emit('location:user:updated', {
        orderId: order.id,
        userId: payload.id,
        location: userLocation,
      });
      await this.emitOrderOfferForOrder(order.id);
    }

    return { ok: true, type: 'user', data: userLocation };
  }

  async emitOrderOfferForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: {
          select: { id: true, name: true, address: true, phoneNumber: true },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, phoneNumber: true },
        },
      },
    });

    if (!order || order.paymentStatus !== 'paid' || order.riderId) {
      return;
    }

    const restaurantLocation = this.locationService.getRestaurantLocation(order.restaurantId);
    const customerLocation = this.locationService.getUserLocation(order.userId);
    if (!restaurantLocation || !customerLocation) {
      return;
    }

    const onlineRiders = await this.prisma.rider.findMany({
      where: { status: 'online' },
      select: { id: true, name: true },
    });

    for (const rider of onlineRiders) {
      const riderLocation = this.locationService.getRiderLocation(rider.id);
      if (!riderLocation) {
        continue;
      }

      const riderToRestaurantKm = this.locationService.distanceKm(riderLocation, restaurantLocation);
      const restaurantToCustomerKm = this.locationService.distanceKm(restaurantLocation, customerLocation);

      this.server.to(this.riderRoom(rider.id)).emit('rider:order-offer', {
        orderId: order.id,
        orderStatus: order.status,
        totalPrice: order.totalPrice,
        riderToRestaurantKm: Number(riderToRestaurantKm.toFixed(2)),
        restaurantToCustomerKm: Number(restaurantToCustomerKm.toFixed(2)),
        restaurant: order.restaurant,
        customer: order.user,
      });
    }
  }

  private restaurantRoom(restaurantId: string) {
    return `restaurant:${restaurantId}`;
  }

  private riderRoom(riderId: string) {
    return `rider:${riderId}`;
  }
}

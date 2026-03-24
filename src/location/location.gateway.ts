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
    }

    return { ok: true, type: 'user', data: userLocation };
  }

  private restaurantRoom(restaurantId: string) {
    return `restaurant:${restaurantId}`;
  }
}

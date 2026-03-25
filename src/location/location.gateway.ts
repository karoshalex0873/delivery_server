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

type CustomerOrderSubscribePayload = {
  orderId: string;
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

  @SubscribeMessage('order:customer:subscribe')
  handleCustomerOrderSubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: CustomerOrderSubscribePayload) {
    if (!payload?.orderId) {
      return { ok: false, message: 'orderId is required' };
    }

    client.join(this.customerOrderRoom(payload.orderId));
    this.logger.debug(`Socket ${client.id} subscribed to order room ${payload.orderId}`);
    return { ok: true, orderId: payload.orderId };
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

    const storedRestaurantLocation = this.locationService.getRestaurantLocation(order.restaurantId);
    const customerLocation = this.locationService.getUserLocation(order.userId);
    if (!customerLocation) {
      return;
    }
    const restaurantLocation = storedRestaurantLocation ?? customerLocation;
    const isEstimated = !storedRestaurantLocation;

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
        isEstimated,
        restaurant: order.restaurant,
        customer: order.user,
      });
    }
  }

  async emitOrderLifecycleForOrder(orderId: string, actorLog?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: {
          select: { id: true, name: true, address: true, phoneNumber: true },
        },
        rider: {
          select: { id: true, name: true, phoneNumber: true, status: true, address: true },
        },
      },
    });

    if (!order) {
      return;
    }

    const restaurantAccepted = ['accepted', 'preparing', 'ready_for_pickup', 'delivery_sign_restaurant', 'delivery_sign_rider', 'out_for_delivery', 'delivered'].includes(order.status);
    const riderAssigned = Boolean(order.riderId);

    const lifecycle = this.buildLifecycle(order.status, restaurantAccepted, riderAssigned, actorLog);

    this.server.to(this.customerOrderRoom(order.id)).emit('order:lifecycle:update', {
      orderId: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      stage: lifecycle.stage,
      stageTitle: lifecycle.title,
      logs: lifecycle.logs,
      restaurant: order.restaurant,
      rider: order.rider,
    });
  }

  private restaurantRoom(restaurantId: string) {
    return `restaurant:${restaurantId}`;
  }

  private riderRoom(riderId: string) {
    return `rider:${riderId}`;
  }

  private customerOrderRoom(orderId: string) {
    return `order:customer:${orderId}`;
  }

  private buildLifecycle(status: string, restaurantAccepted: boolean, riderAssigned: boolean, actorLog?: string) {
    let stage = 1;
    let title = 'Creating Order';

    if (status === 'delivered') {
      stage = 5;
      title = 'Delivered and Signed';
    } else if (status === 'out_for_delivery') {
      stage = 4;
      title = 'On the Move';
    } else if (status === 'ready_for_pickup' || status === 'delivery_sign_restaurant' || status === 'delivery_sign_rider') {
      stage = 3;
      title = 'Ready for Pickup';
    } else if (status === 'preparing') {
      stage = 2;
      title = 'Preparing Meal';
    }

    const logs: string[] = [];
    if (actorLog) {
      logs.push(actorLog);
    }

    if (stage === 1) {
      logs.push(restaurantAccepted ? 'Restaurant has accepted your order and is ready to prepare.' : 'Waiting for restaurant acceptance.');
      logs.push(riderAssigned ? 'A rider was found to deliver your order.' : 'Searching for a nearby rider.');
      if (restaurantAccepted && riderAssigned) {
        logs.push('Order creation complete. Moving to preparation.');
      }
    }

    if (stage === 2) {
      logs.push('Restaurant is preparing your meal.');
      logs.push(riderAssigned ? 'Rider is assigned and waiting for pickup readiness.' : 'Rider assignment in progress.');
    }

    if (stage === 3) {
      logs.push('Meal is ready for pickup.');
      if (status === 'delivery_sign_restaurant') {
        logs.push('Restaurant signed delivery book. Waiting for rider signature.');
      } else if (status === 'delivery_sign_rider') {
        logs.push('Rider signed delivery book. Waiting for restaurant signature.');
      } else {
        logs.push('Waiting for restaurant and rider signatures to start delivery.');
      }
    }

    if (stage === 4) {
      logs.push('Your order is on the move.');
      logs.push('Rider is heading to your location.');
    }

    if (stage === 5) {
      logs.push('Order delivered successfully.');
      logs.push('Delivery signed by customer.');
    }

    return { stage, title, logs };
  }
}

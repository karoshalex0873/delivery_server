import { Injectable, NotFoundException } from '@nestjs/common';
import { NearbyByUserQueryDto, NearbyRidersQueryDto, UpsertLocationDto } from './dto';

type EntityLocation = {
  latitude: number;
  longitude: number;
  updatedAt: string;
};

@Injectable()
export class LocationService {
  private riderLocations = new Map<string, EntityLocation>();
  private userLocations = new Map<string, EntityLocation>();
  private restaurantLocations = new Map<string, EntityLocation>();

  upsertRiderLocation(riderId: string, dto: UpsertLocationDto) {
    const location = this.createLocation(dto);
    this.riderLocations.set(riderId, location);
    return { riderId, ...location };
  }

  upsertUserLocation(userId: string, dto: UpsertLocationDto) {
    const location = this.createLocation(dto);
    this.userLocations.set(userId, location);
    return { userId, ...location };
  }

  upsertRestaurantLocation(restaurantId: string, dto: UpsertLocationDto) {
    const location = this.createLocation(dto);
    this.restaurantLocations.set(restaurantId, location);
    return { restaurantId, ...location };
  }

  getNearbyRiders(query: NearbyRidersQueryDto) {
    const radiusKm = query.radiusKm ?? 5;
    const limit = query.limit ?? 10;

    return this.findNearbyRiders(query.latitude, query.longitude, radiusKm, limit);
  }

  getNearbyRidersForUser(userId: string, query: NearbyByUserQueryDto) {
    const userLocation = this.userLocations.get(userId);

    if (!userLocation) {
      throw new NotFoundException('User location not found');
    }

    const radiusKm = query.radiusKm ?? 5;
    const limit = query.limit ?? 10;

    return {
      userId,
      target: userLocation,
      riders: this.findNearbyRiders(userLocation.latitude, userLocation.longitude, radiusKm, limit),
    };
  }

  getUserLocation(userId: string) {
    return this.userLocations.get(userId) ?? null;
  }

  getRiderLocation(riderId: string) {
    return this.riderLocations.get(riderId) ?? null;
  }

  getRestaurantLocation(restaurantId: string) {
    return this.restaurantLocations.get(restaurantId) ?? null;
  }

  distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
    return this.haversineKm(from.latitude, from.longitude, to.latitude, to.longitude);
  }

  getUserLocationsByIds(userIds: string[]) {
    const uniqueUserIds = [...new Set(userIds)];
    return uniqueUserIds
      .map((userId) => {
        const location = this.userLocations.get(userId);
        if (!location) {
          return null;
        }

        return {
          userId,
          ...location,
        };
      })
      .filter((item): item is { userId: string; latitude: number; longitude: number; updatedAt: string } => Boolean(item));
  }

  private findNearbyRiders(latitude: number, longitude: number, radiusKm: number, limit: number) {
    return [...this.riderLocations.entries()]
      .map(([riderId, riderLocation]) => ({
        riderId,
        ...riderLocation,
        distanceKm: this.haversineKm(latitude, longitude, riderLocation.latitude, riderLocation.longitude),
      }))
      .filter((rider) => rider.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  private createLocation(dto: UpsertLocationDto): EntityLocation {
    return {
      latitude: dto.latitude,
      longitude: dto.longitude,
      updatedAt: new Date().toISOString(),
    };
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

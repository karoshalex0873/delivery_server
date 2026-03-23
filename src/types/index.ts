import { Request } from 'express';
import type { RoleName } from 'src/role/roles.decorator';

export interface AuthenticatedUser {
  sub: string;
  role: RoleName;
  roleId: number;
}

export interface UserRequest extends Request {
  user: AuthenticatedUser;
}


// Restaurant types
export interface RestaurantRecord {
  id: string;
  name: string;
  address?: string;
  phoneNumber?: string;
  userId: string; // Owner's user ID
  menuItems?: MenuItemRecord[];
  // orders?: OrderRecord[];
} 

export interface MenuItemRecord {
  id: string;
  name: string;
  price: number;
  restaurantId: string;
}
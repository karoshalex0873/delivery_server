import { SetMetadata } from '@nestjs/common';

export type RoleName = 'customer' | 'rider' | 'restaurant' | 'admin';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

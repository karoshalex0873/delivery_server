import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export const ORDER_STATUSES = [
  'awaiting_payment',
  'payment_failed',
  'pending',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'delivery_sign_restaurant',
  'delivery_sign_rider',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'rejected',
] as const;

export class CreateOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  menuItemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  restaurantId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status: (typeof ORDER_STATUSES)[number];
}

export class OrderIdParamDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;
}

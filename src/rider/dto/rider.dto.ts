import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RiderAvailabilityDto {
  @IsIn(['online', 'offline'])
  status: 'online' | 'offline';
}

export class RiderOffersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(200)
  radiusKm?: number = 30;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class RiderOrderParamDto {
  @IsUUID()
  orderId: string;
}

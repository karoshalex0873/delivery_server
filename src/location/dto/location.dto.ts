import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpsertLocationDto {
  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;
}

export class NearbyRidersQueryDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radiusKm?: number = 5;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class NearbyByUserQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radiusKm?: number = 5;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}


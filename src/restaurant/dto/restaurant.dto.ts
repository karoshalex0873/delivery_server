import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phoneNumber: string;
}

export class CreateRestaurantForUserDto extends CreateRestaurantDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}

export class UpdateRestaurantDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  phoneNumber?: string;
}

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;
}

export class UpdateMenuItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;
}

export class RestaurantMenuParamsDto {
  @IsUUID()
  @IsNotEmpty()
  restaurantId: string;

  @IsUUID()
  @IsOptional()
  menuItemId?: string;
}

export class RestaurantIdParamDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;
}

export class MenuItemIdParamDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;
}

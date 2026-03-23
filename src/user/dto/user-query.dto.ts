import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

const roleNames = ['customer', 'rider', 'restaurant', 'admin'] as const;

export class UserQueryDto {
  @IsOptional()
  @IsIn(roleNames)
  role?: (typeof roleNames)[number];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  available?: boolean;
}

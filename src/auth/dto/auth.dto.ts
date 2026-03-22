// dto file for auth module
// first name, last name, phone number, password with validation rules


import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
export class SignUpDto {

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+254\d{9}$/, {
    message: 'phoneNumber must be in the format +254XXXXXXXXX',
  })
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsInt()
  @Min(1)
  roleId: number;

  @IsString()
  @IsOptional()
  confirmPassword?: string;
}

// SignInDto
export class SignInDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+254\d{9}$/, {
    message: 'phoneNumber must be in the format +254XXXXXXXXX',
  })
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}  
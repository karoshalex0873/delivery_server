import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InitiateStkPushDto {
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @MaxLength(30)
  @IsNotEmpty()
  phoneNumber: string;
}

export class DarajaCallbackItemDto {
  @IsString()
  @IsOptional()
  Name?: string;

  @IsOptional()
  Value?: string | number;
}

export class DarajaStkCallbackDto {
  @IsOptional()
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{
          Name?: string;
          Value?: string | number;
        }>;
      };
    };
  };
}

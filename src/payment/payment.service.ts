import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DarajaStkCallbackDto, InitiateStkPushDto } from './dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async initiateStkPush(userId: string, dto: InitiateStkPushDto) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        userId,
      },
      include: {
        user: true,
        restaurant: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus === 'paid') {
      throw new BadRequestException('This order has already been paid');
    }

    if (order.status !== 'awaiting_payment' && order.status !== 'payment_failed') {
      throw new BadRequestException('This order is not awaiting payment');
    }

    const amount = Math.round(order.totalPrice);

    if (amount < 1) {
      throw new BadRequestException('Order amount must be at least 1');
    }

    if (this.isPaymentMockEnabled()) {
      this.logger.warn(`PAYMENT_MOCK_SUCCESS enabled. Marking order=${order.id} as paid without Daraja call.`);

      const updatedOrder = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'pending',
          paymentStatus: 'paid',
          paymentMethod: 'mpesa_mock',
          mpesaReceiptNumber: `MOCK-${Date.now()}`,
          paidAt: new Date(),
          paymentFailureReason: null,
        },
        include: this.orderInclude(),
      });

      return {
        order: updatedOrder,
        customerMessage: 'Mock payment successful (development mode).',
        checkoutRequestId: `MOCK-CHECKOUT-${order.id}`,
        merchantRequestId: `MOCK-MERCHANT-${order.id}`,
        responseDescription: 'Mock STK push bypassed',
      };
    }

    const phoneNumber = this.normalizeKenyanPhoneNumber(dto.phoneNumber ?? order.user.phoneNumber);
    const timestamp = this.generateTimestamp();
    const transactionType = this.getDarajaTransactionType();
    const businessShortCode = this.getBusinessShortCode(transactionType);
    const passkey = this.requireEnv('DARAJA_PASSKEY');
    const callbackUrl = this.requireEnv('DARAJA_CALLBACK_URL');

    this.logger.log(
      `Initiating STK push for order=${order.id}, user=${userId}, amount=${amount}, transactionType=${transactionType}`,
    );

    const accessToken = await this.getDarajaAccessToken();
    const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');

    const stkPayload: Record<string, string> = {
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: amount.toString(),
      PartyA: phoneNumber,
      PartyB: businessShortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      TransactionDesc: `Payment for order ${order.id}`,
      AccountReference: order.id,
    };

    this.logger.debug(
      `STK payload prepared for order=${order.id}, phone=${phoneNumber}, shortcode=${businessShortCode}`,
    );

    const response = await fetch(`${this.getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stkPayload),
    });

    const rawBody = await response.text();
    let data: Record<string, string>;

    try {
      data = JSON.parse(rawBody) as Record<string, string>;
    } catch {
      data = {};
    }

    if (!response.ok || data.ResponseCode !== '0') {
      this.logger.error(
        `STK push failed for order=${order.id}, status=${response.status}, responseCode=${data.ResponseCode}, description=${data.ResponseDescription}, error=${data.errorMessage}, rawBody=${rawBody}`,
      );
      throw new BadRequestException(data.errorMessage ?? data.ResponseDescription ?? 'Failed to initiate Daraja payment');
    }

    this.logger.log(
      `STK push accepted for order=${order.id}, checkoutRequestId=${data.CheckoutRequestID}, merchantRequestId=${data.MerchantRequestID}`,
    );

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        paymentMethod: 'mpesa_daraja',
        merchantRequestId: data.MerchantRequestID,
        checkoutRequestId: data.CheckoutRequestID,
        paymentFailureReason: null,
      },
      include: this.orderInclude(),
    });

    return {
      order: updatedOrder,
      customerMessage: data.CustomerMessage ?? 'STK push sent. Complete payment on your phone.',
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      responseDescription: data.ResponseDescription,
    };
  }

  async handleDarajaCallback(payload: DarajaStkCallbackDto) {
    const callback = payload.Body?.stkCallback;

    if (!callback?.CheckoutRequestID) {
      this.logger.warn('Received callback without CheckoutRequestID');
      return;
    }

    this.logger.log(
      `Received callback checkoutRequestId=${callback.CheckoutRequestID}, resultCode=${callback.ResultCode}, resultDesc=${callback.ResultDesc}`,
    );

    const order = await this.prisma.order.findFirst({
      where: {
        checkoutRequestId: callback.CheckoutRequestID,
      },
    });

    if (!order) {
      this.logger.warn(`No order found for checkoutRequestId=${callback.CheckoutRequestID}`);
      return;
    }

    const resultCode = callback.ResultCode ?? 1;
    const metadata = this.callbackMetadataToMap(callback.CallbackMetadata?.Item);

    if (resultCode === 0) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'pending',
          paymentStatus: 'paid',
          mpesaReceiptNumber: metadata.get('MpesaReceiptNumber')?.toString() ?? null,
          paidAt: new Date(),
          paymentFailureReason: null,
        },
      });

      this.logger.log(`Payment marked as paid for order=${order.id}`);
      return;
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'payment_failed',
        paymentStatus: 'failed',
        paymentFailureReason: callback.ResultDesc ?? 'Payment failed',
      },
    });

    this.logger.warn(`Payment failed for order=${order.id}, reason=${callback.ResultDesc ?? 'Payment failed'}`);
  }

  private async getDarajaAccessToken() {
    const consumerKey = this.requireEnv('DARAJA_CONSUMER_KEY');
    const consumerSecret = this.requireEnv('DARAJA_CONSUMER_SECRET');
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const response = await fetch(
      `${this.getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      },
    );

    const data = (await response.json()) as { access_token?: string; errorMessage?: string };

    if (!response.ok || !data.access_token) {
      this.logger.error(`Daraja auth failed: ${data.errorMessage ?? 'Unknown authentication error'}`);
      throw new BadRequestException(data.errorMessage ?? 'Unable to authenticate with Daraja');
    }

    return data.access_token;
  }

  private getDarajaBaseUrl() {
    return process.env.DARAJA_BASE_URL ?? 'https://sandbox.safaricom.co.ke';
  }

  private getDarajaTransactionType(): 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline' {
    const transactionType = process.env.DARAJA_TRANSACTION_TYPE ?? 'CustomerPayBillOnline';

    if (transactionType !== 'CustomerPayBillOnline' && transactionType !== 'CustomerBuyGoodsOnline') {
      throw new BadRequestException(
        'DARAJA_TRANSACTION_TYPE must be CustomerPayBillOnline or CustomerBuyGoodsOnline',
      );
    }

    return transactionType;
  }

  private getBusinessShortCode(transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline') {
    if (transactionType === 'CustomerBuyGoodsOnline') {
      return this.requireEnv('DARAJA_TILL_NUMBER');
    }

    return this.requireEnv('DARAJA_SHORT_CODE');
  }

  private requireEnv(name: string) {
    const value = process.env[name];

    if (!value) {
      throw new BadRequestException(`${name} is not configured`);
    }

    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'your-daraja-passkey' ||
      normalized === 'your-consumer-key' ||
      normalized === 'your-consumer-secret' ||
      normalized.includes('your-public-domain.example.com')
    ) {
      throw new BadRequestException(`${name} is using a placeholder value`);
    }

    return value;
  }

  private isPaymentMockEnabled() {
    const flag = process.env.PAYMENT_MOCK_SUCCESS;
    return flag?.toLowerCase() === 'true';
  }

  private normalizeKenyanPhoneNumber(input: string) {
    const digits = input.replace(/\D/g, '');

    if (digits.startsWith('254') && digits.length === 12) {
      return digits;
    }

    if (digits.startsWith('0') && digits.length === 10) {
      return `254${digits.slice(1)}`;
    }

    if (digits.length === 9) {
      return `254${digits}`;
    }

    throw new BadRequestException('Phone number must be a valid Kenyan Safaricom number');
  }

  private generateTimestamp() {
    const date = new Date();
    const parts = [
      date.getFullYear(),
      `${date.getMonth() + 1}`.padStart(2, '0'),
      `${date.getDate()}`.padStart(2, '0'),
      `${date.getHours()}`.padStart(2, '0'),
      `${date.getMinutes()}`.padStart(2, '0'),
      `${date.getSeconds()}`.padStart(2, '0'),
    ];

    return parts.join('');
  }

  private callbackMetadataToMap(items?: Array<{ Name?: string; Value?: string | number }>) {
    return new Map(
      (items ?? [])
        .filter((item): item is { Name: string; Value?: string | number } => Boolean(item.Name))
        .map((item) => [item.Name, item.Value]),
    );
  }

  private orderInclude() {
    return {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
        },
      },
      rider: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          address: true,
          phoneNumber: true,
        },
      },
      orderItems: {
        include: {
          menuItem: true,
        },
      },
    };
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface PaystackInitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackVerifyResult {
  status: string; // 'success' | 'failed' | 'abandoned' | ...
  amount: number; // in kobo
  reference: string;
  currency: string;
}

/**
 * Wraps the Paystack Transactions API:
 * https://paystack.com/docs/api/transaction/
 * https://paystack.com/docs/payments/webhooks/
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string | null;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || null;
  }

  private assertConfigured(): string {
    if (!this.secretKey) {
      throw new ServiceUnavailableException(
        'Payments are not configured. Set PAYSTACK_SECRET_KEY.',
      );
    }
    return this.secretKey;
  }

  async initializeTransaction(params: {
    email: string;
    amountNaira: number;
    reference: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackInitializeResult> {
    const secretKey = this.assertConfigured();

    const response = await this.request(
      `${this.baseUrl}/transaction/initialize`,
      secretKey,
      {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
          amount: Math.round(params.amountNaira * 100), // Paystack expects kobo
          reference: params.reference,
          callback_url: params.callbackUrl,
          metadata: params.metadata,
        }),
      },
    );

    return response.data as PaystackInitializeResult;
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
    const secretKey = this.assertConfigured();

    const response = await this.request(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      secretKey,
      { method: 'GET' },
    );

    return response.data as PaystackVerifyResult;
  }

  /**
   * Verifies the `x-paystack-signature` header: a hex HMAC-SHA512 of the
   * raw request body, keyed with the secret key. Must run against the raw
   * (unparsed) body — see main.ts's `rawBody: true` and the webhook
   * controller's use of `RawBodyRequest`.
   */
  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string | undefined,
  ): boolean {
    if (!this.secretKey || !signature) {
      return false;
    }

    const expected = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  private async request(
    url: string,
    secretKey: string,
    init: { method: 'GET' | 'POST'; body?: string },
  ): Promise<{ status: boolean; message: string; data: unknown }> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: init.body,
      });
    } catch (err) {
      this.logger.error(`Paystack request to ${url} failed: ${err.message}`);
      throw new ServiceUnavailableException(
        'Could not reach the payment provider. Try again shortly.',
      );
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.status) {
      throw new BadRequestException(
        payload?.message || 'Payment provider request failed',
      );
    }

    return payload;
  }
}

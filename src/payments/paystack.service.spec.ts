import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaystackService } from './paystack.service';

describe('PaystackService', () => {
  const SECRET = 'sk_test_abc123';

  const buildService = async (secretKey: string | undefined) => {
    const configService = {
      get: () => secretKey,
    } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    return module.get(PaystackService);
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('initializeTransaction', () => {
    it('throws ServiceUnavailableException when PAYSTACK_SECRET_KEY is missing', async () => {
      const service = await buildService(undefined);
      await expect(
        service.initializeTransaction({
          email: 'jane@example.com',
          amountNaira: 5000,
          reference: 'REF-1',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('converts naira to kobo and returns the checkout details', async () => {
      const service = await buildService(SECRET);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: true,
          message: 'Authorization URL created',
          data: {
            authorization_url: 'https://checkout.paystack.com/abc',
            access_code: 'abc',
            reference: 'REF-1',
          },
        }),
      });

      const result = await service.initializeTransaction({
        email: 'jane@example.com',
        amountNaira: 5000,
        reference: 'REF-1',
      });

      expect(result.authorization_url).toBe('https://checkout.paystack.com/abc');

      const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
      const sentBody = JSON.parse(requestInit.body);
      expect(sentBody.amount).toBe(500000); // 5000 naira -> 500000 kobo
    });

    it('throws BadRequestException when Paystack rejects the request', async () => {
      const service = await buildService(SECRET);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ status: false, message: 'Invalid email' }),
      });

      await expect(
        service.initializeTransaction({
          email: 'bad',
          amountNaira: 100,
          reference: 'REF-2',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('verifyTransaction', () => {
    it('returns transaction status and amount', async () => {
      const service = await buildService(SECRET);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: true,
          data: { status: 'success', amount: 500000, reference: 'REF-1', currency: 'NGN' },
        }),
      });

      const result = await service.verifyTransaction('REF-1');
      expect(result.status).toBe('success');
      expect(result.amount).toBe(500000);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a correctly signed payload', async () => {
      const service = await buildService(SECRET);
      const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      const signature = crypto.createHmac('sha512', SECRET).update(body).digest('hex');

      expect(service.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('rejects a payload signed with the wrong secret', async () => {
      const service = await buildService(SECRET);
      const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      const wrongSignature = crypto
        .createHmac('sha512', 'wrong_secret')
        .update(body)
        .digest('hex');

      expect(service.verifyWebhookSignature(body, wrongSignature)).toBe(false);
    });

    it('rejects when no signature is provided', async () => {
      const service = await buildService(SECRET);
      const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));

      expect(service.verifyWebhookSignature(body, undefined)).toBe(false);
    });

    it('returns false (not throw) when the secret key is not configured', async () => {
      const service = await buildService(undefined);
      const body = Buffer.from('{}');

      expect(service.verifyWebhookSignature(body, 'anything')).toBe(false);
    });
  });
});

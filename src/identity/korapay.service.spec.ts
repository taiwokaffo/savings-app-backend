import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { KorapayService } from './korapay.service';

describe('KorapayService', () => {
  const buildService = async (secretKey: string | undefined) => {
    const configService = {
      get: () => secretKey,
    } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KorapayService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    return module.get(KorapayService);
  };

  const mockFetchOnce = (status: number, body: unknown) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      json: async () => body,
    });
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => jest.restoreAllMocks());

  it('throws ServiceUnavailableException when KORAPAY_SECRET_KEY is missing', async () => {
    const service = await buildService(undefined);
    await expect(service.verifyNin('12345678901')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns verified:true on a successful lookup with no data matching', async () => {
    const service = await buildService('sk_test_123');
    mockFetchOnce(200, {
      status: true,
      message: 'NIN verified successfully',
      data: { id: '12345678901', id_type: 'ng_nin', first_name: 'Bimbo' },
    });

    const result = await service.verifyNin('12345678901');

    expect(result.verified).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/nin'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_123',
        }),
      }),
    );
  });

  it('returns verified:false with a reason when the provider reports failure', async () => {
    const service = await buildService('sk_test_123');
    mockFetchOnce(200, { status: false, message: 'BVN not found' });

    const result = await service.verifyBvn('00000000000');

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('BVN not found');
  });

  it('rejects when the returned name does not match the expected identity', async () => {
    const service = await buildService('sk_test_123');
    mockFetchOnce(200, {
      status: true,
      data: {
        validation: {
          first_name: { value: 'Someone', match: false },
          last_name: { value: 'Else', match: true },
        },
      },
    });

    const result = await service.verifyNin('12345678901', {
      firstName: 'Jane',
      lastName: 'Doe',
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/does not match/i);
  });

  it('accepts a successful match when validation passes', async () => {
    const service = await buildService('sk_test_123');
    mockFetchOnce(200, {
      status: true,
      data: {
        validation: {
          first_name: { value: 'Jane', match: true },
          last_name: { value: 'Doe', match: true },
        },
      },
    });

    const result = await service.verifyNin('12345678901', {
      firstName: 'Jane',
      lastName: 'Doe',
    });

    expect(result.verified).toBe(true);
  });

  it('throws ServiceUnavailableException when the network request fails', async () => {
    const service = await buildService('sk_test_123');
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));

    await expect(service.verifyNin('12345678901')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

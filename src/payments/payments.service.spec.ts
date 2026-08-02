import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentStatus } from '../common/enums/payment.enums';
import { User } from '../users/entities/user.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepository: jest.Mocked<Repository<PaymentTransaction>>;
  let paystackService: jest.Mocked<PaystackService>;
  let walletService: jest.Mocked<WalletService>;

  beforeEach(async () => {
    paymentsRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (record) => record),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<PaymentTransaction>>;

    paystackService = {
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
    } as unknown as jest.Mocked<PaystackService>;

    walletService = {
      fund: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WalletService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(PaymentTransaction),
          useValue: paymentsRepository,
        },
        { provide: PaystackService, useValue: paystackService },
        { provide: WalletService, useValue: walletService },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('initialize', () => {
    it('creates a PENDING record and returns the checkout details', async () => {
      paystackService.initializeTransaction.mockResolvedValue({
        authorization_url: 'https://checkout.paystack.com/xyz',
        access_code: 'xyz',
        reference: 'WALLET-abc',
      });

      const user = { id: 'user-1', email: 'jane@example.com' } as User;
      const result = await service.initialize(user, 5000);

      expect(paymentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.PENDING, amount: '5000.00' }),
      );
      expect(result.authorizationUrl).toBe('https://checkout.paystack.com/xyz');
    });
  });

  describe('verifyAndCreditForUser', () => {
    it('throws NotFoundException for an unknown reference', async () => {
      paymentsRepository.findOne.mockResolvedValue(null);
      await expect(
        service.verifyAndCreditForUser('user-1', 'nope'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws ForbiddenException for another user's payment", async () => {
      paymentsRepository.findOne.mockResolvedValue({
        userId: 'someone-else',
        reference: 'REF-1',
        status: PaymentStatus.PENDING,
        amount: '5000.00',
      } as PaymentTransaction);

      await expect(
        service.verifyAndCreditForUser('user-1', 'REF-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('credits the wallet once on a verified successful payment', async () => {
      paymentsRepository.findOne.mockResolvedValue({
        userId: 'user-1',
        reference: 'REF-1',
        status: PaymentStatus.PENDING,
        amount: '5000.00',
      } as PaymentTransaction);
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'success',
        amount: 500000, // 5000 naira in kobo
        reference: 'REF-1',
        currency: 'NGN',
      });

      const result = await service.verifyAndCreditForUser('user-1', 'REF-1');

      expect(walletService.fund).toHaveBeenCalledWith(
        'user-1',
        5000,
        expect.stringContaining('REF-1'),
      );
      expect(result.status).toBe(PaymentStatus.SUCCESS);
    });

    it('is idempotent: does not re-credit an already-SUCCESS payment', async () => {
      paymentsRepository.findOne.mockResolvedValue({
        userId: 'user-1',
        reference: 'REF-1',
        status: PaymentStatus.SUCCESS,
        amount: '5000.00',
      } as PaymentTransaction);

      await service.verifyAndCreditForUser('user-1', 'REF-1');

      expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
      expect(walletService.fund).not.toHaveBeenCalled();
    });

    it('marks FAILED and does not credit when Paystack reports a non-success status', async () => {
      paymentsRepository.findOne.mockResolvedValue({
        userId: 'user-1',
        reference: 'REF-1',
        status: PaymentStatus.PENDING,
        amount: '5000.00',
      } as PaymentTransaction);
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'abandoned',
        amount: 500000,
        reference: 'REF-1',
        currency: 'NGN',
      });

      const result = await service.verifyAndCreditForUser('user-1', 'REF-1');

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(walletService.fund).not.toHaveBeenCalled();
    });

    it('marks FAILED and throws when the verified amount does not match', async () => {
      paymentsRepository.findOne.mockResolvedValue({
        userId: 'user-1',
        reference: 'REF-1',
        status: PaymentStatus.PENDING,
        amount: '5000.00',
      } as PaymentTransaction);
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'success',
        amount: 100, // tampered / mismatched amount
        reference: 'REF-1',
        currency: 'NGN',
      });

      await expect(
        service.verifyAndCreditForUser('user-1', 'REF-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(walletService.fund).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhookReference', () => {
    it('silently no-ops for an unknown reference (does not throw)', async () => {
      paymentsRepository.findOne.mockResolvedValue(null);
      await expect(
        service.handleWebhookReference('unknown-ref'),
      ).resolves.toBeUndefined();
      expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
    });

    it('credits the wallet for a known, verified reference', async () => {
      paymentsRepository.findOne.mockResolvedValue({
        userId: 'user-1',
        reference: 'REF-1',
        status: PaymentStatus.PENDING,
        amount: '5000.00',
      } as PaymentTransaction);
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'success',
        amount: 500000,
        reference: 'REF-1',
        currency: 'NGN',
      });

      await service.handleWebhookReference('REF-1');

      expect(walletService.fund).toHaveBeenCalled();
    });
  });
});

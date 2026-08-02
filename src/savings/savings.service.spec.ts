import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SavingsService } from './savings.service';
import { WalletService } from '../wallet/wallet.service';
import { ProfilesService } from '../users/profiles.service';
import { SettingsService } from '../settings/settings.service';
import { SavingsPlan } from './entities/savings-plan.entity';
import { SavingsTransaction } from './entities/savings-transaction.entity';
import {
  AutosaveFrequency,
  SavingsPlanStatus,
  SavingsPlanType,
} from '../common/enums/savings.enums';

describe('SavingsService — autosave on REGULAR vs TARGET plans', () => {
  let service: SavingsService;
  let plansRepository: jest.Mocked<Repository<SavingsPlan>>;
  let transactionsRepository: jest.Mocked<Repository<SavingsTransaction>>;
  let walletService: jest.Mocked<WalletService>;
  let profilesService: jest.Mocked<ProfilesService>;
  let settingsService: jest.Mocked<SettingsService>;

  beforeEach(async () => {
    plansRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (plan) => plan),
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<SavingsPlan>>;

    transactionsRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (tx) => tx),
    } as unknown as jest.Mocked<Repository<SavingsTransaction>>;

    walletService = {
      debit: jest.fn().mockResolvedValue(undefined),
      credit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WalletService>;

    profilesService = {
      findByUserId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ProfilesService>;

    settingsService = {
      // Defaults to the documented default (KYC gate off) unless a test
      // overrides it.
      getBoolean: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<SettingsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingsService,
        {
          provide: getRepositoryToken(SavingsPlan),
          useValue: plansRepository,
        },
        {
          provide: getRepositoryToken(SavingsTransaction),
          useValue: transactionsRepository,
        },
        { provide: WalletService, useValue: walletService },
        { provide: ProfilesService, useValue: profilesService },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get(SavingsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('allows autosave on a REGULAR plan without a targetAmount', async () => {
      const plan = await service.create('user-1', {
        name: 'Emergency Fund',
        type: SavingsPlanType.REGULAR,
        autosaveEnabled: true,
        autosaveFrequency: AutosaveFrequency.DAILY,
        autosaveAmount: 2000,
      } as any);

      expect(plan.autosaveEnabled).toBe(true);
      expect(plan.autosaveFrequency).toBe(AutosaveFrequency.DAILY);
      expect(plan.autosaveAmount).toBe('2000.00');
      expect(plan.nextAutosaveDate).toEqual(expect.any(String));
      expect(plan.targetAmount).toBeNull();
    });
  });

  describe('runAutosaveForPlan', () => {
    const buildPlan = (overrides: Partial<SavingsPlan>): SavingsPlan =>
      ({
        id: 'plan-1',
        userId: 'user-1',
        name: 'Test Plan',
        type: SavingsPlanType.REGULAR,
        status: SavingsPlanStatus.ACTIVE,
        currentBalance: '0.00',
        targetAmount: null,
        autosaveEnabled: true,
        autosaveFrequency: AutosaveFrequency.WEEKLY,
        autosaveAmount: '5000.00',
        nextAutosaveDate: '2026-01-01',
        ...overrides,
      }) as SavingsPlan;

    it('charges autosave on a REGULAR plan and keeps it active (no completion)', async () => {
      const plan = buildPlan({ type: SavingsPlanType.REGULAR });
      plansRepository.findOne.mockResolvedValue({
        ...plan,
        currentBalance: '5000.00',
      } as SavingsPlan);

      const result = await service.runAutosaveForPlan(plan);

      expect(result).toBe(true);
      expect(walletService.debit).toHaveBeenCalledWith(
        'user-1',
        5000,
        expect.stringContaining('Autosave'),
      );
      // REGULAR plans never auto-complete, regardless of balance.
      expect(plan.status).toBe(SavingsPlanStatus.ACTIVE);
      // Still enabled, so it gets rescheduled for the next cycle.
      expect(plansRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ autosaveEnabled: true }),
      );
    });

    it('charges autosave on a TARGET plan and completes it once the target is reached', async () => {
      const plan = buildPlan({
        type: SavingsPlanType.TARGET,
        targetAmount: '5000.00',
        currentBalance: '0.00',
      });
      // Simulate the post-credit refreshed row: target reached & completed.
      plansRepository.findOne.mockResolvedValue({
        ...plan,
        currentBalance: '5000.00',
        status: SavingsPlanStatus.COMPLETED,
        autosaveEnabled: false,
        nextAutosaveDate: null,
      } as SavingsPlan);

      const result = await service.runAutosaveForPlan(plan);

      expect(result).toBe(true);
      expect(plan.status).toBe(SavingsPlanStatus.COMPLETED);
      expect(plan.autosaveEnabled).toBe(false);
      expect(plan.nextAutosaveDate).toBeNull();
    });

    it('skips (without throwing) when the wallet has insufficient funds, for either plan type', async () => {
      walletService.debit.mockRejectedValue(new Error('Insufficient wallet balance'));
      const plan = buildPlan({ type: SavingsPlanType.REGULAR });

      const result = await service.runAutosaveForPlan(plan);

      expect(result).toBe(false);
      expect(plan.currentBalance).toBe('0.00'); // unchanged
    });
  });

  describe('withdraw — KYC gate (requireKycForWithdrawal setting)', () => {
    const buildPlan = (overrides: Partial<SavingsPlan>): SavingsPlan =>
      ({
        id: 'plan-1',
        userId: 'user-1',
        name: 'Test Plan',
        type: SavingsPlanType.REGULAR,
        status: SavingsPlanStatus.ACTIVE,
        currentBalance: '10000.00',
        targetAmount: null,
        ...overrides,
      }) as SavingsPlan;

    it('does not check KYC at all when the setting is off (default)', async () => {
      settingsService.getBoolean.mockResolvedValue(false);
      plansRepository.findOne.mockResolvedValue(buildPlan({}));

      await service.withdraw('user-1', 'plan-1', 1000);

      expect(profilesService.findByUserId).not.toHaveBeenCalled();
      expect(walletService.credit).toHaveBeenCalled();
    });

    it('blocks withdrawal when the setting is on and BVN is not verified', async () => {
      settingsService.getBoolean.mockResolvedValue(true);
      plansRepository.findOne.mockResolvedValue(buildPlan({}));
      profilesService.findByUserId.mockResolvedValue({
        bvnVerified: false,
      } as any);

      await expect(
        service.withdraw('user-1', 'plan-1', 1000),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(walletService.credit).not.toHaveBeenCalled();
    });

    it('allows withdrawal when the setting is on and BVN is verified', async () => {
      settingsService.getBoolean.mockResolvedValue(true);
      plansRepository.findOne.mockResolvedValue(buildPlan({}));
      profilesService.findByUserId.mockResolvedValue({
        bvnVerified: true,
      } as any);

      await service.withdraw('user-1', 'plan-1', 1000);

      expect(walletService.credit).toHaveBeenCalled();
    });
  });
});

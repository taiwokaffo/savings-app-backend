import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { SavingsPlan } from './entities/savings-plan.entity';
import { SavingsTransaction } from './entities/savings-transaction.entity';
import { WalletService } from '../wallet/wallet.service';
import { ProfilesService } from '../users/profiles.service';
import { SettingsService } from '../settings/settings.service';
import { SettingKey } from '../settings/setting-keys';
import { CreateSavingsPlanDto } from './dto/create-savings-plan.dto';
import { UpdateAutosaveDto } from './dto/update-autosave.dto';
import {
  AutosaveFrequency,
  SavingsPlanStatus,
  SavingsPlanType,
  SavingsTransactionType,
} from '../common/enums/savings.enums';

@Injectable()
export class SavingsService {
  private readonly logger = new Logger(SavingsService.name);

  constructor(
    @InjectRepository(SavingsPlan)
    private readonly plansRepository: Repository<SavingsPlan>,
    @InjectRepository(SavingsTransaction)
    private readonly transactionsRepository: Repository<SavingsTransaction>,
    private readonly walletService: WalletService,
    private readonly profilesService: ProfilesService,
    private readonly settingsService: SettingsService,
  ) {}

  async create(userId: string, dto: CreateSavingsPlanDto) {
    if (dto.type === SavingsPlanType.TARGET && !dto.targetAmount) {
      throw new BadRequestException(
        'targetAmount is required for TARGET savings plans',
      );
    }

    const targetAmount =
      dto.type === SavingsPlanType.TARGET && dto.targetAmount
        ? dto.targetAmount.toFixed(2)
        : null;

    const plan = this.plansRepository.create({
      userId,
      name: dto.name,
      type: dto.type,
      targetAmount,
      targetDate: dto.targetDate ?? null,
      currentBalance: '0.00',
      autosaveEnabled: !!dto.autosaveEnabled,
    });

    if (dto.autosaveEnabled) {
      if (!dto.autosaveFrequency || !dto.autosaveAmount) {
        throw new BadRequestException(
          'autosaveFrequency and autosaveAmount are required when autosaveEnabled is true',
        );
      }
      plan.autosaveFrequency = dto.autosaveFrequency;
      plan.autosaveAmount = dto.autosaveAmount.toFixed(2);
      plan.nextAutosaveDate = this.computeNextDate(
        new Date(),
        dto.autosaveFrequency,
      );
    }

    const saved = await this.plansRepository.save(plan);

    if (dto.initialDeposit) {
      return this.deposit(userId, saved.id, dto.initialDeposit);
    }

    return saved;
  }

  async findAllForUser(userId: string) {
    return this.plansRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneForUser(userId: string, planId: string): Promise<SavingsPlan> {
    const plan = await this.plansRepository.findOne({
      where: { id: planId },
    });
    if (!plan) {
      throw new NotFoundException('Savings plan not found');
    }
    if (plan.userId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this savings plan',
      );
    }
    return plan;
  }

  async getTransactions(userId: string, planId: string) {
    await this.findOneForUser(userId, planId);
    return this.transactionsRepository.find({
      where: { savingsPlanId: planId },
      order: { createdAt: 'DESC' },
    });
  }

  async deposit(userId: string, planId: string, amount: number) {
    const plan = await this.findOneForUser(userId, planId);
    this.assertPlanIsActive(plan);

    await this.walletService.debit(
      userId,
      amount,
      `Deposit to "${plan.name}"`,
    );

    return this.creditPlan(plan, amount, SavingsTransactionType.DEPOSIT);
  }

  async withdraw(userId: string, planId: string, amount: number) {
    const plan = await this.findOneForUser(userId, planId);

    if (
      await this.settingsService.getBoolean(
        SettingKey.REQUIRE_KYC_FOR_WITHDRAWAL,
      )
    ) {
      const profile = await this.profilesService.findByUserId(userId);
      if (!profile?.bvnVerified) {
        throw new ForbiddenException(
          'A verified BVN is required before you can withdraw. Add your BVN in your profile first.',
        );
      }
    }

    if (parseFloat(plan.currentBalance) < amount) {
      throw new BadRequestException(
        'Withdrawal amount exceeds savings plan balance',
      );
    }

    plan.currentBalance = (
      parseFloat(plan.currentBalance) - amount
    ).toFixed(2);

    if (
      plan.type === SavingsPlanType.TARGET &&
      plan.status === SavingsPlanStatus.COMPLETED
    ) {
      plan.status = SavingsPlanStatus.ACTIVE;
    }

    await this.plansRepository.save(plan);
    await this.walletService.credit(
      userId,
      amount,
      `Withdrawal from "${plan.name}"`,
    );

    return this.recordPlanTransaction(
      plan,
      amount,
      SavingsTransactionType.WITHDRAWAL,
    );
  }

  async updateAutosave(userId: string, planId: string, dto: UpdateAutosaveDto) {
    const plan = await this.findOneForUser(userId, planId);
    this.assertPlanIsActive(plan);

    if (!dto.autosaveEnabled) {
      plan.autosaveEnabled = false;
      plan.autosaveFrequency = null;
      plan.autosaveAmount = null;
      plan.nextAutosaveDate = null;
      return this.plansRepository.save(plan);
    }

    if (!dto.autosaveFrequency || !dto.autosaveAmount) {
      throw new BadRequestException(
        'autosaveFrequency and autosaveAmount are required when autosaveEnabled is true',
      );
    }

    plan.autosaveEnabled = true;
    plan.autosaveFrequency = dto.autosaveFrequency;
    plan.autosaveAmount = dto.autosaveAmount.toFixed(2);
    // Restart the schedule from today whenever autosave settings change
    plan.nextAutosaveDate = this.computeNextDate(
      new Date(),
      dto.autosaveFrequency,
    );

    return this.plansRepository.save(plan);
  }

  async closePlan(userId: string, planId: string) {
    const plan = await this.findOneForUser(userId, planId);

    if (parseFloat(plan.currentBalance) > 0) {
      throw new BadRequestException(
        'Withdraw the full balance before closing this savings plan',
      );
    }

    plan.status = SavingsPlanStatus.CLOSED;
    plan.autosaveEnabled = false;
    plan.autosaveFrequency = null;
    plan.autosaveAmount = null;
    plan.nextAutosaveDate = null;
    return this.plansRepository.save(plan);
  }

  /**
   * Finds every active plan whose nextAutosaveDate is today or earlier.
   * Used by the cron scheduler.
   */
  findDuePlans() {
    const today = this.toDateOnlyString(new Date());
    return this.plansRepository.find({
      where: {
        autosaveEnabled: true,
        status: SavingsPlanStatus.ACTIVE,
        nextAutosaveDate: LessThanOrEqual(today),
      },
    });
  }

  /**
   * Executes a single autosave charge for a plan: debits the owner's wallet
   * and credits the plan. Skips (without throwing) if the wallet balance is
   * insufficient, so the scheduler can keep processing other plans.
   */
  async runAutosaveForPlan(plan: SavingsPlan): Promise<boolean> {
    if (!plan.autosaveAmount || !plan.autosaveFrequency) {
      this.logger.warn(
        `Plan ${plan.id} was due for autosave but has no autosave config; skipping`,
      );
      return false;
    }

    const amount = parseFloat(plan.autosaveAmount);
    const frequency = plan.autosaveFrequency;

    try {
      await this.walletService.debit(
        plan.userId,
        amount,
        `Autosave to "${plan.name}"`,
      );
    } catch (err) {
      this.logger.warn(
        `Skipped autosave for plan ${plan.id} (user ${plan.userId}): ${err.message}`,
      );
      // Push the schedule forward anyway so we don't retry every run of the
      // same day; it will be attempted again on the next scheduled date.
      plan.nextAutosaveDate = this.computeNextDate(new Date(), frequency);
      await this.plansRepository.save(plan);
      return false;
    }

    await this.creditPlan(plan, amount, SavingsTransactionType.AUTOSAVE);

    const refreshed = await this.plansRepository.findOne({
      where: { id: plan.id },
    });

    // creditPlan() may have marked the plan COMPLETED and turned autosave
    // off (target reached) — only reschedule if it's still active.
    if (refreshed && refreshed.autosaveEnabled && refreshed.autosaveFrequency) {
      refreshed.nextAutosaveDate = this.computeNextDate(
        new Date(),
        refreshed.autosaveFrequency,
      );
      await this.plansRepository.save(refreshed);
    }

    return true;
  }

  private async creditPlan(
    plan: SavingsPlan,
    amount: number,
    type: SavingsTransactionType,
  ) {
    plan.currentBalance = (
      parseFloat(plan.currentBalance) + amount
    ).toFixed(2);

    if (
      plan.type === SavingsPlanType.TARGET &&
      plan.targetAmount &&
      parseFloat(plan.currentBalance) >= parseFloat(plan.targetAmount)
    ) {
      plan.status = SavingsPlanStatus.COMPLETED;
      plan.autosaveEnabled = false;
      plan.nextAutosaveDate = null;
    }

    await this.plansRepository.save(plan);
    return this.recordPlanTransaction(plan, amount, type);
  }

  private recordPlanTransaction(
    plan: SavingsPlan,
    amount: number,
    type: SavingsTransactionType,
  ) {
    const tx = this.transactionsRepository.create({
      savingsPlanId: plan.id,
      type,
      amount: amount.toFixed(2),
      balanceAfter: plan.currentBalance,
    });
    return this.transactionsRepository.save(tx);
  }

  private assertPlanIsActive(plan: SavingsPlan) {
    if (plan.status !== SavingsPlanStatus.ACTIVE) {
      throw new BadRequestException(
        `This savings plan is ${plan.status.toLowerCase()} and no longer accepts deposits`,
      );
    }
  }

  private computeNextDate(from: Date, frequency: AutosaveFrequency): string {
    const next = new Date(from);
    switch (frequency) {
      case AutosaveFrequency.DAILY:
        next.setDate(next.getDate() + 1);
        break;
      case AutosaveFrequency.WEEKLY:
        next.setDate(next.getDate() + 7);
        break;
      case AutosaveFrequency.MONTHLY:
        next.setMonth(next.getMonth() + 1);
        break;
    }
    return this.toDateOnlyString(next);
  }

  private toDateOnlyString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** Aggregate counts/sums for the admin summary report. */
  async getStats(): Promise<{
    totalPlans: number;
    activeAutosavePlans: number;
    completedTargetPlans: number;
    totalSavingsBalance: string;
  }> {
    const [totalPlans, activeAutosavePlans, completedTargetPlans, balanceRow] =
      await Promise.all([
        this.plansRepository.count(),
        this.plansRepository.count({ where: { autosaveEnabled: true } }),
        this.plansRepository.count({
          where: {
            type: SavingsPlanType.TARGET,
            status: SavingsPlanStatus.COMPLETED,
          },
        }),
        this.plansRepository
          .createQueryBuilder('plan')
          .select('COALESCE(SUM(plan.currentBalance), 0)', 'sum')
          .getRawOne<{ sum: string }>(),
      ]);

    return {
      totalPlans,
      activeAutosavePlans,
      completedTargetPlans,
      totalSavingsBalance: parseFloat(balanceRow?.sum ?? '0').toFixed(2),
    };
  }
}

import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { UsersService } from '../users/users.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { WalletTransactionType } from '../common/enums/savings.enums';
import { AdminListQueryDto } from '../common/dto/admin-list-query.dto';

export interface PaginatedWalletTransactions {
  data: WalletTransaction[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletTransaction)
    private readonly walletTxRepository: Repository<WalletTransaction>,
    private readonly usersService: UsersService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async getBalance(userId: string) {
    const user = await this.usersService.findById(userId);
    return { walletBalance: user.walletBalance };
  }

  async fund(userId: string, amount: number, description = 'Wallet funding') {
    const user = await this.usersService.adjustWalletBalance(userId, amount);
    return this.recordTransaction(
      userId,
      WalletTransactionType.FUND,
      amount,
      user.walletBalance,
      description,
    );
  }

  /**
   * Moves money OUT of the wallet (e.g. into a savings plan).
   * Throws if the wallet balance is insufficient.
   */
  async debit(
    userId: string,
    amount: number,
    description = 'Debit to savings',
  ) {
    const user = await this.usersService.findById(userId);
    if (parseFloat(user.walletBalance) < amount) {
      throw new ConflictException('Insufficient wallet balance');
    }
    const updated = await this.usersService.adjustWalletBalance(
      userId,
      -amount,
    );
    return this.recordTransaction(
      userId,
      WalletTransactionType.DEBIT_TO_SAVINGS,
      amount,
      updated.walletBalance,
      description,
    );
  }

  /**
   * Moves money INTO the wallet (e.g. from a savings withdrawal).
   */
  async credit(
    userId: string,
    amount: number,
    description = 'Credit from savings',
  ) {
    const updated = await this.usersService.adjustWalletBalance(
      userId,
      amount,
    );
    return this.recordTransaction(
      userId,
      WalletTransactionType.CREDIT_FROM_SAVINGS,
      amount,
      updated.walletBalance,
      description,
    );
  }

  getTransactions(userId: string) {
    return this.walletTxRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Admin: every wallet transaction across every user, optionally filtered. */
  async adminListAll(
    query: AdminListQueryDto,
  ): Promise<PaginatedWalletTransactions> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await this.walletTxRepository.findAndCount({
      where: query.userId ? { userId: query.userId } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  private async recordTransaction(
    userId: string,
    type: WalletTransactionType,
    amount: number,
    balanceAfter: string,
    description: string,
  ) {
    const tx = this.walletTxRepository.create({
      userId,
      type,
      amount: amount.toFixed(2),
      balanceAfter,
      description,
    });
    const saved = await this.walletTxRepository.save(tx);

    await this.activityLogService.record(`WALLET_${type}`, userId, {
      amount: saved.amount,
      balanceAfter: saved.balanceAfter,
      description,
    });

    return saved;
  }
}

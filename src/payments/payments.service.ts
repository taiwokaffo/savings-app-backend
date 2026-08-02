import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaystackService } from './paystack.service';
import { WalletService } from '../wallet/wallet.service';
import { User } from '../users/entities/user.entity';
import { PaymentStatus } from '../common/enums/payment.enums';
import { AdminListQueryDto } from '../common/dto/admin-list-query.dto';

export interface PaginatedPayments {
  data: PaymentTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface PaymentStats {
  totalSuccessfulPayments: number;
  totalSuccessfulVolume: string;
  totalPendingPayments: number;
  totalFailedPayments: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly paymentsRepository: Repository<PaymentTransaction>,
    private readonly paystackService: PaystackService,
    private readonly walletService: WalletService,
  ) {}

  async initialize(user: User, amount: number, callbackUrl?: string) {
    const reference = this.generateReference(user.id);

    const record = this.paymentsRepository.create({
      userId: user.id,
      reference,
      amount: amount.toFixed(2),
      status: PaymentStatus.PENDING,
    });
    await this.paymentsRepository.save(record);

    const result = await this.paystackService.initializeTransaction({
      email: user.email,
      amountNaira: amount,
      reference,
      callbackUrl,
      metadata: { userId: user.id, purpose: 'wallet_funding' },
    });

    return {
      reference: result.reference,
      authorizationUrl: result.authorization_url,
      accessCode: result.access_code,
    };
  }

  /** Used by the authenticated GET /verify/:reference endpoint. */
  async verifyAndCreditForUser(userId: string, reference: string) {
    const record = await this.paymentsRepository.findOne({
      where: { reference },
    });
    if (!record) {
      throw new NotFoundException('Payment reference not found');
    }
    if (record.userId !== userId) {
      throw new ForbiddenException('This payment does not belong to you');
    }
    return this.verifyAndCredit(record);
  }

  /** Used by the Paystack webhook handler. */
  async handleWebhookReference(reference: string): Promise<void> {
    const record = await this.paymentsRepository.findOne({
      where: { reference },
    });
    if (!record) {
      this.logger.warn(`Webhook received for unknown reference ${reference}`);
      return;
    }
    await this.verifyAndCredit(record);
  }

  private async verifyAndCredit(
    record: PaymentTransaction,
  ): Promise<PaymentTransaction> {
    // Idempotent: webhook and client-side verify can both land on the same
    // reference; only the first one to arrive should credit the wallet.
    if (record.status === PaymentStatus.SUCCESS) {
      return record;
    }

    const verified = await this.paystackService.verifyTransaction(
      record.reference,
    );

    if (verified.status !== 'success') {
      record.status = PaymentStatus.FAILED;
      return this.paymentsRepository.save(record);
    }

    // Guard against a tampered/mismatched amount before crediting anything.
    const expectedKobo = Math.round(parseFloat(record.amount) * 100);
    if (verified.amount !== expectedKobo) {
      record.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(record);
      throw new BadRequestException(
        'Payment amount does not match the expected amount',
      );
    }

    record.status = PaymentStatus.SUCCESS;
    await this.paymentsRepository.save(record);

    await this.walletService.fund(
      record.userId,
      parseFloat(record.amount),
      `Paystack payment (${record.reference})`,
    );

    return record;
  }

  private generateReference(userId: string): string {
    const shortUserId = userId.replace(/-/g, '').slice(0, 8);
    const random = crypto.randomBytes(4).toString('hex');
    return `WALLET-${shortUserId}-${Date.now()}-${random}`;
  }

  /** Admin: every payment transaction across every user (the "transaction log"). */
  async adminListAll(query: AdminListQueryDto): Promise<PaginatedPayments> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: FindOptionsWhere<PaymentTransaction> = {};
    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status as PaymentStatus;

    const [data, total] = await this.paymentsRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /** Aggregate payment counts/volume for the admin summary report. */
  async getStats(): Promise<PaymentStats> {
    const [totalSuccessfulPayments, totalPendingPayments, totalFailedPayments, volumeRow] =
      await Promise.all([
        this.paymentsRepository.count({ where: { status: PaymentStatus.SUCCESS } }),
        this.paymentsRepository.count({ where: { status: PaymentStatus.PENDING } }),
        this.paymentsRepository.count({ where: { status: PaymentStatus.FAILED } }),
        this.paymentsRepository
          .createQueryBuilder('payment')
          .select('COALESCE(SUM(payment.amount), 0)', 'sum')
          .where('payment.status = :status', { status: PaymentStatus.SUCCESS })
          .getRawOne<{ sum: string }>(),
      ]);

    return {
      totalSuccessfulPayments,
      totalPendingPayments,
      totalFailedPayments,
      totalSuccessfulVolume: parseFloat(volumeRow?.sum ?? '0').toFixed(2),
    };
  }
}

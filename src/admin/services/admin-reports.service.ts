import { Injectable } from '@nestjs/common';
import { UsersService, UserStats } from '../../users/users.service';
import { SavingsService } from '../../savings/savings.service';
import { PaymentsService, PaymentStats } from '../../payments/payments.service';

export interface AdminReport {
  generatedAt: string;
  users: UserStats;
  savings: {
    totalPlans: number;
    activeAutosavePlans: number;
    completedTargetPlans: number;
    totalSavingsBalance: string;
  };
  payments: PaymentStats;
}

@Injectable()
export class AdminReportsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly savingsService: SavingsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async generate(): Promise<AdminReport> {
    const [users, savings, payments] = await Promise.all([
      this.usersService.getStats(),
      this.savingsService.getStats(),
      this.paymentsService.getStats(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      users,
      savings,
      payments,
    };
  }
}

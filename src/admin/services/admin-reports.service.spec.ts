import { Test, TestingModule } from '@nestjs/testing';
import { AdminReportsService } from './admin-reports.service';
import { UsersService } from '../../users/users.service';
import { SavingsService } from '../../savings/savings.service';
import { PaymentsService } from '../../payments/payments.service';

describe('AdminReportsService', () => {
  let service: AdminReportsService;
  let usersService: jest.Mocked<UsersService>;
  let savingsService: jest.Mocked<SavingsService>;
  let paymentsService: jest.Mocked<PaymentsService>;

  beforeEach(async () => {
    usersService = {
      getStats: jest.fn().mockResolvedValue({
        totalUsers: 10,
        totalAdmins: 1,
        totalVerifiedEmails: 8,
        totalWalletBalance: '150000.00',
      }),
    } as unknown as jest.Mocked<UsersService>;

    savingsService = {
      getStats: jest.fn().mockResolvedValue({
        totalPlans: 15,
        activeAutosavePlans: 6,
        completedTargetPlans: 2,
        totalSavingsBalance: '90000.00',
      }),
    } as unknown as jest.Mocked<SavingsService>;

    paymentsService = {
      getStats: jest.fn().mockResolvedValue({
        totalSuccessfulPayments: 4,
        totalSuccessfulVolume: '40000.00',
        totalPendingPayments: 1,
        totalFailedPayments: 0,
      }),
    } as unknown as jest.Mocked<PaymentsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminReportsService,
        { provide: UsersService, useValue: usersService },
        { provide: SavingsService, useValue: savingsService },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    service = module.get(AdminReportsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('combines stats from users, savings, and payments into one report', async () => {
    const report = await service.generate();

    expect(usersService.getStats).toHaveBeenCalled();
    expect(savingsService.getStats).toHaveBeenCalled();
    expect(paymentsService.getStats).toHaveBeenCalled();

    expect(report.users.totalUsers).toBe(10);
    expect(report.savings.totalPlans).toBe(15);
    expect(report.payments.totalSuccessfulPayments).toBe(4);
    expect(report.generatedAt).toEqual(expect.any(String));
  });
});

import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { SavingsModule } from '../savings/savings.module';
import { PaymentsModule } from '../payments/payments.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminTransactionsController } from './controllers/admin-transactions.controller';
import { AdminPaymentsController } from './controllers/admin-payments.controller';
import { AdminActivityLogController } from './controllers/admin-activity-log.controller';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { AdminSettingsController } from './controllers/admin-settings.controller';
import { AdminReportsService } from './services/admin-reports.service';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    WalletModule,
    SavingsModule,
    PaymentsModule,
    ActivityLogModule,
    SettingsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminTransactionsController,
    AdminPaymentsController,
    AdminActivityLogController,
    AdminReportsController,
    AdminSettingsController,
  ],
  providers: [AdminReportsService],
})
export class AdminModule {}

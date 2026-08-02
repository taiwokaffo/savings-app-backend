import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingsPlan } from './entities/savings-plan.entity';
import { SavingsTransaction } from './entities/savings-transaction.entity';
import { SavingsService } from './savings.service';
import { SavingsController } from './savings.controller';
import { AutosaveScheduler } from './autosave.scheduler';
import { WalletModule } from '../wallet/wallet.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingsPlan, SavingsTransaction]),
    WalletModule,
    UsersModule,
    SettingsModule,
  ],
  providers: [SavingsService, AutosaveScheduler],
  controllers: [SavingsController],
  exports: [SavingsService],
})
export class SavingsModule {}

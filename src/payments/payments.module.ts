import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaystackService } from './paystack.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentTransaction]), WalletModule],
  providers: [PaystackService, PaymentsService],
  controllers: [PaymentsController, PaystackWebhookController],
  exports: [PaystackService, PaymentsService],
})
export class PaymentsModule {}

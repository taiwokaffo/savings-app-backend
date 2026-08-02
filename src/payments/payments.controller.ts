import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { PaymentsService } from './payments.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';

@UseGuards(JwtAuthGuard)
@Controller('wallet/fund/paystack')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initialize')
  initialize(@CurrentUser() user: User, @Body() dto: InitializePaymentDto) {
    return this.paymentsService.initialize(user, dto.amount, dto.callbackUrl);
  }

  @Get('verify/:reference')
  verify(@CurrentUser() user: User, @Param('reference') reference: string) {
    return this.paymentsService.verifyAndCreditForUser(user.id, reference);
  }
}

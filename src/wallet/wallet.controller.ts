import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { WalletService } from './wallet.service';
import { FundWalletDto } from './dto/fund-wallet.dto';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  getBalance(@CurrentUser() user: User) {
    return this.walletService.getBalance(user.id);
  }

  @Post('fund')
  fund(@CurrentUser() user: User, @Body() dto: FundWalletDto) {
    return this.walletService.fund(user.id, dto.amount);
  }

  @Get('transactions')
  getTransactions(@CurrentUser() user: User) {
    return this.walletService.getTransactions(user.id);
  }
}

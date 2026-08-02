import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user.enums';
import { WalletService } from '../../wallet/wallet.service';
import { AdminListQueryDto } from '../../common/dto/admin-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/transactions')
export class AdminTransactionsController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  findAll(@Query() query: AdminListQueryDto) {
    return this.walletService.adminListAll(query);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { SavingsService } from './savings.service';
import { CreateSavingsPlanDto } from './dto/create-savings-plan.dto';
import { UpdateAutosaveDto } from './dto/update-autosave.dto';
import { AmountDto } from './dto/amount.dto';

@UseGuards(JwtAuthGuard)
@Controller('savings')
export class SavingsController {
  constructor(private readonly savingsService: SavingsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateSavingsPlanDto) {
    return this.savingsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.savingsService.findAllForUser(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savingsService.findOneForUser(user.id, id);
  }

  @Get(':id/transactions')
  getTransactions(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savingsService.getTransactions(user.id, id);
  }

  @Post(':id/deposit')
  deposit(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmountDto,
  ) {
    return this.savingsService.deposit(user.id, id, dto.amount);
  }

  @Post(':id/withdraw')
  withdraw(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmountDto,
  ) {
    return this.savingsService.withdraw(user.id, id, dto.amount);
  }

  @Patch(':id/autosave')
  updateAutosave(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAutosaveDto,
  ) {
    return this.savingsService.updateAutosave(user.id, id, dto);
  }

  @Delete(':id')
  close(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.savingsService.closePlan(user.id, id);
  }
}

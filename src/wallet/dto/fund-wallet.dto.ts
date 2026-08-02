import { IsNumber, IsPositive } from 'class-validator';

export class FundWalletDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;
}

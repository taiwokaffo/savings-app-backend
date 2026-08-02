import { IsNumber, IsPositive } from 'class-validator';

export class AmountDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;
}

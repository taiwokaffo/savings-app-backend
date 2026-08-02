import { IsNumber, IsOptional, IsPositive, IsUrl } from 'class-validator';

export class InitializePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  // Optional: where Paystack redirects the browser after checkout.
  // If omitted, the dashboard-configured default callback URL is used.
  @IsOptional()
  @IsUrl()
  callbackUrl?: string;
}

import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AutosaveFrequency,
  SavingsPlanType,
} from '../../common/enums/savings.enums';

export class CreateSavingsPlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsEnum(SavingsPlanType)
  type: SavingsPlanType;

  // Required when type = TARGET
  @ValidateIf((dto) => dto.type === SavingsPlanType.TARGET)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetAmount?: number;

  // Optional deadline for TARGET plans
  @ValidateIf((dto) => dto.type === SavingsPlanType.TARGET)
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  // Optional initial deposit funded from wallet
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  initialDeposit?: number;

  @IsOptional()
  autosaveEnabled?: boolean;

  @ValidateIf((dto) => dto.autosaveEnabled === true)
  @IsEnum(AutosaveFrequency)
  autosaveFrequency?: AutosaveFrequency;

  @ValidateIf((dto) => dto.autosaveEnabled === true)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  autosaveAmount?: number;
}

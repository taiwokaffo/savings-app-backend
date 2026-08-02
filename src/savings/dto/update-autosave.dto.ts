import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsPositive,
  ValidateIf,
} from 'class-validator';
import { AutosaveFrequency } from '../../common/enums/savings.enums';

export class UpdateAutosaveDto {
  @IsBoolean()
  autosaveEnabled: boolean;

  // Required when enabling autosave
  @ValidateIf((dto) => dto.autosaveEnabled === true)
  @IsEnum(AutosaveFrequency)
  autosaveFrequency?: AutosaveFrequency;

  @ValidateIf((dto) => dto.autosaveEnabled === true)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  autosaveAmount?: number;
}

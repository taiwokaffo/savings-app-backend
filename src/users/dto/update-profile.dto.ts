import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  // Verified against the government database via Korapay before being
  // saved — see ProfilesService.update(). Rejected with 400 if invalid.
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'NIN must be exactly 11 digits' })
  nin?: string;

  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'BVN must be exactly 11 digits' })
  bvn?: string;
}

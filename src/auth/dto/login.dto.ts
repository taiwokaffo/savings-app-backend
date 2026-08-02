import { IsString } from 'class-validator';

export class LoginDto {
  // Accepts either username or email
  @IsString()
  identifier: string;

  @IsString()
  password: string;
}

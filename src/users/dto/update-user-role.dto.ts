import { IsEnum } from 'class-validator';
import { UserRole } from '../../common/enums/user.enums';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

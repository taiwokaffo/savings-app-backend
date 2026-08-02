import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user.enums';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../../auth/auth.service';
import { UpdateUserRoleDto } from '../../users/dto/update-user-role.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AdminCreateUserDto } from '../../auth/dto/admin-create-user.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAllWithProfiles(query);
  }

  @Post()
  create(@CurrentUser() admin: User, @Body() dto: AdminCreateUserDto) {
    return this.authService.adminCreateUser(dto, admin.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findByIdWithProfile(id);
  }

  @Patch(':id/role')
  updateRole(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(id, dto.role, admin.id);
  }
}

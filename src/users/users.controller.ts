import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user.enums';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
  ) {}

  // -- Self-service (any authenticated user) --------------------------

  @Get('me')
  getMyProfile(@CurrentUser() user: User) {
    return this.usersService.findByIdWithProfile(user.id);
  }

  @Patch('me/profile')
  updateMyProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.profilesService.update(user.id, dto);
  }

  // -- Admin only -------------------------------------------------------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAllWithProfiles(query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findByIdWithProfile(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/role')
  updateRole(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(id, dto.role, currentUser.id);
  }
}

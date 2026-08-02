import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Profile } from './entities/profile.entity';
import { UsersService } from './users.service';
import { ProfilesService } from './profiles.service';
import { UsersController } from './users.controller';
import { IdentityModule } from '../identity/identity.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Profile]),
    IdentityModule,
    ActivityLogModule,
  ],
  providers: [UsersService, ProfilesService],
  controllers: [UsersController],
  exports: [UsersService, ProfilesService],
})
export class UsersModule {}

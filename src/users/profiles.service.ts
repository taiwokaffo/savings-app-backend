import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { KorapayService } from '../identity/korapay.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profilesRepository: Repository<Profile>,
    private readonly korapayService: KorapayService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  createEmpty(userId: string): Promise<Profile> {
    const profile = this.profilesRepository.create({ userId });
    return this.profilesRepository.save(profile);
  }

  findByUserId(userId: string): Promise<Profile | null> {
    return this.profilesRepository.findOne({ where: { userId } });
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    let profile = await this.findByUserId(userId);

    // Defensive fallback: every user should get a profile row at
    // registration, but create one on the fly if it's somehow missing.
    if (!profile) {
      profile = this.profilesRepository.create({ userId });
    }

    const { nin, bvn, ...rest } = dto;
    Object.assign(profile, rest);

    // Only re-verify if the value actually changed — avoids re-charging
    // the verification provider on every unrelated profile edit.
    if (nin !== undefined && nin !== profile.nin) {
      await this.verifyAndApplyNin(userId, profile, nin);
    }
    if (bvn !== undefined && bvn !== profile.bvn) {
      await this.verifyAndApplyBvn(userId, profile, bvn);
    }

    const saved = await this.profilesRepository.save(profile);
    await this.activityLogService.record('PROFILE_UPDATED', userId, {
      fields: Object.keys(dto),
    });
    return saved;
  }

  private async verifyAndApplyNin(userId: string, profile: Profile, nin: string) {
    const result = await this.korapayService.verifyNin(nin, {
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
    });

    if (!result.verified) {
      await this.activityLogService.record('NIN_VERIFICATION_FAILED', userId, {
        reason: result.reason,
      });
      throw new BadRequestException(
        result.reason ?? 'NIN verification failed. Please check the number and try again.',
      );
    }

    profile.nin = nin;
    profile.ninVerified = true;
    profile.ninVerifiedAt = new Date();
    await this.activityLogService.record('NIN_VERIFIED', userId);
  }

  private async verifyAndApplyBvn(userId: string, profile: Profile, bvn: string) {
    const result = await this.korapayService.verifyBvn(bvn, {
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
    });

    if (!result.verified) {
      await this.activityLogService.record('BVN_VERIFICATION_FAILED', userId, {
        reason: result.reason,
      });
      throw new BadRequestException(
        result.reason ?? 'BVN verification failed. Please check the number and try again.',
      );
    }

    profile.bvn = bvn;
    profile.bvnVerified = true;
    profile.bvnVerifiedAt = new Date();
    await this.activityLogService.record('BVN_VERIFIED', userId);
  }
}

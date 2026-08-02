import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ProfilesService } from './profiles.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto } from './dto/pagination-query.dto';

export interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

export interface UserStats {
  totalUsers: number;
  totalAdmins: number;
  totalVerifiedEmails: number;
  totalWalletBalance: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly profilesService: ProfilesService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async create(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: [{ email: data.email }, { username: data.username }],
    });

    if (existing) {
      throw new ConflictException(
        existing.email === data.email
          ? 'A user with this email already exists'
          : 'This username is already taken',
      );
    }

    const user = this.usersRepository.create(data);
    const saved = await this.usersRepository.save(user);

    // Every user gets an (initially empty) profile they can fill in later.
    await this.profilesService.createEmpty(saved.id);

    return saved;
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByIdWithProfile(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['profile'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAllWithProfiles(
    query: PaginationQueryDto,
  ): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await this.usersRepository.findAndCount({
      relations: ['profile'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async updateRole(
    targetUserId: string,
    role: UserRole,
    requestingUserId: string,
  ): Promise<User> {
    if (targetUserId === requestingUserId) {
      throw new BadRequestException(
        'You cannot change your own role. Ask another admin to do it.',
      );
    }

    const user = await this.setRole(targetUserId, role);
    await this.activityLogService.record('USER_ROLE_CHANGED', requestingUserId, {
      targetUserId,
      newRole: role,
    });
    return user;
  }

  /**
   * Directly assigns a role with no self-change protection. Used by
   * `updateRole()` (after its safety check) and by admin account creation,
   * where there's no "self" to worry about.
   */
  async setRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.findById(userId);
    user.role = role;
    return this.usersRepository.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  findByEmailOrUsername(identifier: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: [{ email: identifier }, { username: identifier }],
    });
  }

  async adjustWalletBalance(userId: string, delta: number): Promise<User> {
    const user = await this.findById(userId);
    const newBalance = parseFloat(user.walletBalance) + delta;
    if (newBalance < 0) {
      throw new ConflictException('Insufficient wallet balance');
    }
    user.walletBalance = newBalance.toFixed(2);
    return this.usersRepository.save(user);
  }

  async setEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.usersRepository.update(userId, {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: expiresAt,
    });
  }

  findByVerificationTokenHash(tokenHash: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { emailVerificationTokenHash: tokenHash },
    });
  }

  async markEmailVerified(userId: string): Promise<User> {
    const user = await this.findById(userId);
    user.isEmailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    return this.usersRepository.save(user);
  }

  /** Aggregate counts for the admin summary report. */
  async getStats(): Promise<UserStats> {
    const [totalUsers, totalAdmins, totalVerifiedEmails, balanceRow] =
      await Promise.all([
        this.usersRepository.count(),
        this.usersRepository.count({ where: { role: UserRole.ADMIN } }),
        this.usersRepository.count({ where: { isEmailVerified: true } }),
        this.usersRepository
          .createQueryBuilder('user')
          .select('COALESCE(SUM(user.walletBalance), 0)', 'sum')
          .getRawOne<{ sum: string }>(),
      ]);

    return {
      totalUsers,
      totalAdmins,
      totalVerifiedEmails,
      totalWalletBalance: parseFloat(balanceRow?.sum ?? '0').toFixed(2),
    };
  }
}

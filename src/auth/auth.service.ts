import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../common/enums/user.enums';

const SALT_ROUNDS = 10;
const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TOKEN_TTL_HOURS = 24;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async register(dto: RegisterDto) {
    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      password: hashedPassword,
    });

    const rawToken = await this.issueAndSendVerificationToken(user);
    const isProduction = process.env.NODE_ENV === 'production';

    await this.activityLogService.record('USER_REGISTERED', user.id, {
      username: user.username,
      email: user.email,
    });

    return {
      message:
        'Registration successful. Please check your email to confirm your account before logging in.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      // Convenience for local development/testing only — never exposed in
      // production, where the token is only ever delivered via email.
      ...(isProduction ? {} : { devVerificationToken: rawToken }),
    };
  }

  /**
   * Admin-only account creation (see AdminUsersController). Bypasses the
   * email-verification flow since an admin is vouching for the account
   * directly, and can assign a role immediately.
   */
  async adminCreateUser(dto: AdminCreateUserDto, adminUserId: string) {
    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      password: hashedPassword,
    });

    await this.usersService.markEmailVerified(user.id);

    if (dto.role && dto.role !== UserRole.USER) {
      await this.usersService.setRole(user.id, dto.role);
    }

    await this.activityLogService.record('ADMIN_CREATED_USER', adminUserId, {
      newUserId: user.id,
      username: user.username,
      email: user.email,
      role: dto.role ?? UserRole.USER,
    });

    return this.usersService.findByIdWithProfile(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailOrUsername(
      dto.identifier,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Please confirm your email address before logging in. Use the ' +
          'resend-verification endpoint if you need a new link.',
      );
    }

    await this.activityLogService.record('USER_LOGIN', user.id);

    return this.buildAuthResponse(user);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = this.hashToken(dto.token);
    const user = await this.usersService.findByVerificationTokenHash(
      tokenHash,
    );

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'This verification link has expired. Please request a new one.',
      );
    }

    if (user.isEmailVerified) {
      return { message: 'Email is already verified.' };
    }

    await this.usersService.markEmailVerified(user.id);
    await this.activityLogService.record('EMAIL_VERIFIED', user.id);
    return { message: 'Email verified successfully. You can now log in.' };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.usersService.findByEmail(dto.email);

    // Always return a generic response, whether or not the email exists,
    // so this endpoint can't be used to enumerate registered emails.
    const genericResponse = {
      message:
        'If an account with that email exists and is not yet verified, a new verification link has been sent.',
    };

    if (!user || user.isEmailVerified) {
      return genericResponse;
    }

    await this.issueAndSendVerificationToken(user);
    return genericResponse;
  }

  private async issueAndSendVerificationToken(user: User): Promise<string> {
    const rawToken = crypto
      .randomBytes(VERIFICATION_TOKEN_BYTES)
      .toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );

    await this.usersService.setEmailVerificationToken(
      user.id,
      tokenHash,
      expiresAt,
    );

    await this.mailService.sendVerificationEmail(user.email, rawToken);
    return rawToken;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private buildAuthResponse(user: User) {
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        walletBalance: user.walletBalance,
      },
    };
  }
}

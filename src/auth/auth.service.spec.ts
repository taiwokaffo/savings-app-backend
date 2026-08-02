import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let mailService: jest.Mocked<MailService>;
  let jwtService: jest.Mocked<JwtService>;
  let activityLogService: jest.Mocked<ActivityLogService>;

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      findByEmailOrUsername: jest.fn(),
      findByEmail: jest.fn(),
      setEmailVerificationToken: jest.fn(),
      findByVerificationTokenHash: jest.fn(),
      markEmailVerified: jest.fn(),
      setRole: jest.fn(),
      findByIdWithProfile: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    mailService = {
      sendVerificationEmail: jest.fn(),
    } as unknown as jest.Mocked<MailService>;

    jwtService = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
    } as unknown as jest.Mocked<JwtService>;

    activityLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ActivityLogService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: MailService, useValue: mailService },
        { provide: JwtService, useValue: jwtService },
        { provide: ActivityLogService, useValue: activityLogService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('register', () => {
    it('creates an unverified user, stores a hashed token, and emails the raw token', async () => {
      usersService.create.mockResolvedValue({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
        isEmailVerified: false,
      } as any);

      const result = await service.register({
        username: 'jane',
        email: 'jane@example.com',
        password: 'Password123',
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'jane',
          email: 'jane@example.com',
        }),
      );
      expect(usersService.setEmailVerificationToken).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        expect.any(Date),
      );
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        'jane@example.com',
        expect.any(String),
      );
      expect(result.user).toEqual({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
      });
      // Outside production, the raw token is echoed back for local testing.
      expect(result.devVerificationToken).toEqual(expect.any(String));
    });

    it('omits devVerificationToken when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      usersService.create.mockResolvedValue({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
      } as any);

      const result = await service.register({
        username: 'jane',
        email: 'jane@example.com',
        password: 'Password123',
      });

      expect(result).not.toHaveProperty('devVerificationToken');
    });
  });

  describe('login', () => {
    it('rejects with ForbiddenException when the email is not verified', async () => {
      usersService.findByEmailOrUsername.mockResolvedValue({
        id: 'user-1',
        password: await bcrypt.hash('Password123', 10),
        isEmailVerified: false,
      } as any);

      await expect(
        service.login({ identifier: 'jane', password: 'Password123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects with UnauthorizedException for an unknown identifier', async () => {
      usersService.findByEmailOrUsername.mockResolvedValue(null);

      await expect(
        service.login({ identifier: 'nobody', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects with UnauthorizedException for a wrong password', async () => {
      usersService.findByEmailOrUsername.mockResolvedValue({
        id: 'user-1',
        password: await bcrypt.hash('Password123', 10),
        isEmailVerified: true,
      } as any);

      await expect(
        service.login({ identifier: 'jane', password: 'WrongPassword' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns an access token for a verified user with correct credentials', async () => {
      usersService.findByEmailOrUsername.mockResolvedValue({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
        password: await bcrypt.hash('Password123', 10),
        walletBalance: '0.00',
        isEmailVerified: true,
      } as any);

      const result = await service.login({
        identifier: 'jane',
        password: 'Password123',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.username).toBe('jane');
    });
  });

  describe('verifyEmail', () => {
    it('marks the user verified for a valid, unexpired token', async () => {
      usersService.findByVerificationTokenHash.mockResolvedValue({
        id: 'user-1',
        isEmailVerified: false,
        emailVerificationExpiresAt: new Date(Date.now() + 60_000),
      } as any);

      const result = await service.verifyEmail({ token: 'raw-token' });

      expect(usersService.markEmailVerified).toHaveBeenCalledWith('user-1');
      expect(result.message).toMatch(/verified successfully/i);
    });

    it('rejects an unknown token', async () => {
      usersService.findByVerificationTokenHash.mockResolvedValue(null);

      await expect(
        service.verifyEmail({ token: 'bad-token' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an expired token', async () => {
      usersService.findByVerificationTokenHash.mockResolvedValue({
        id: 'user-1',
        isEmailVerified: false,
        emailVerificationExpiresAt: new Date(Date.now() - 60_000),
      } as any);

      await expect(
        service.verifyEmail({ token: 'expired-token' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersService.markEmailVerified).not.toHaveBeenCalled();
    });

    it('is idempotent for an already-verified user', async () => {
      usersService.findByVerificationTokenHash.mockResolvedValue({
        id: 'user-1',
        isEmailVerified: true,
        emailVerificationExpiresAt: new Date(Date.now() + 60_000),
      } as any);

      const result = await service.verifyEmail({ token: 'raw-token' });

      expect(usersService.markEmailVerified).not.toHaveBeenCalled();
      expect(result.message).toMatch(/already verified/i);
    });
  });

  describe('resendVerification', () => {
    it('returns a generic message and sends nothing for an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.resendVerification({
        email: 'ghost@example.com',
      });

      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
      expect(result.message).toMatch(/if an account/i);
    });

    it('issues and emails a fresh token for an existing, unverified user', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        isEmailVerified: false,
      } as any);

      await service.resendVerification({ email: 'jane@example.com' });

      expect(usersService.setEmailVerificationToken).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        expect.any(Date),
      );
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        'jane@example.com',
        expect.any(String),
      );
    });

    it('sends nothing for an already-verified user', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        isEmailVerified: true,
      } as any);

      await service.resendVerification({ email: 'jane@example.com' });

      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });
});

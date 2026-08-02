import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { ProfilesService } from './profiles.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { User } from './entities/user.entity';
import { UserRole } from '../common/enums/user.enums';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<Repository<User>>;
  let profilesService: jest.Mocked<ProfilesService>;
  let activityLogService: jest.Mocked<ActivityLogService>;

  beforeEach(async () => {
    usersRepository = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(),
      findAndCount: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    profilesService = {
      createEmpty: jest.fn(),
    } as unknown as jest.Mocked<ProfilesService>;

    activityLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ActivityLogService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: ProfilesService, useValue: profilesService },
        { provide: ActivityLogService, useValue: activityLogService },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('rejects a duplicate email or username', async () => {
      usersRepository.findOne.mockResolvedValue({
        email: 'jane@example.com',
      } as User);

      await expect(
        service.create({
          username: 'jane',
          email: 'jane@example.com',
          password: 'hashed',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the user and an empty profile for them', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      usersRepository.save.mockResolvedValue({
        id: 'user-1',
        username: 'jane',
        email: 'jane@example.com',
      } as User);

      const result = await service.create({
        username: 'jane',
        email: 'jane@example.com',
        password: 'hashed',
      });

      expect(usersRepository.save).toHaveBeenCalled();
      expect(profilesService.createEmpty).toHaveBeenCalledWith('user-1');
      expect(result.id).toBe('user-1');
    });
  });

  describe('updateRole', () => {
    it('prevents an admin from changing their own role', async () => {
      await expect(
        service.updateRole('user-1', UserRole.USER, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('allows an admin to change another user’s role', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'user-2',
        role: UserRole.USER,
      } as User);
      usersRepository.save.mockImplementation(async (u) => u as User);

      const result = await service.updateRole(
        'user-2',
        UserRole.ADMIN,
        'admin-1',
      );

      expect(result.role).toBe(UserRole.ADMIN);
      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.ADMIN }),
      );
    });
  });
});

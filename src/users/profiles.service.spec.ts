import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProfilesService } from './profiles.service';
import { KorapayService } from '../identity/korapay.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { Profile } from './entities/profile.entity';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let profilesRepository: jest.Mocked<Repository<Profile>>;
  let korapayService: jest.Mocked<KorapayService>;
  let activityLogService: jest.Mocked<ActivityLogService>;

  beforeEach(async () => {
    profilesRepository = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (p) => p),
    } as unknown as jest.Mocked<Repository<Profile>>;

    korapayService = {
      verifyNin: jest.fn(),
      verifyBvn: jest.fn(),
    } as unknown as jest.Mocked<KorapayService>;

    activityLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ActivityLogService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: getRepositoryToken(Profile), useValue: profilesRepository },
        { provide: KorapayService, useValue: korapayService },
        { provide: ActivityLogService, useValue: activityLogService },
      ],
    }).compile();

    service = module.get(ProfilesService);
  });

  afterEach(() => jest.clearAllMocks());

  const existingProfile = (overrides: Partial<Profile> = {}): Profile =>
    ({
      id: 'profile-1',
      userId: 'user-1',
      firstName: null,
      lastName: null,
      nin: null,
      ninVerified: false,
      ninVerifiedAt: null,
      bvn: null,
      bvnVerified: false,
      bvnVerifiedAt: null,
      ...overrides,
    }) as Profile;

  it('stores and marks NIN verified when Korapay confirms it', async () => {
    profilesRepository.findOne.mockResolvedValue(existingProfile());
    korapayService.verifyNin.mockResolvedValue({ verified: true });

    const result = await service.update('user-1', { nin: '12345678901' });

    expect(korapayService.verifyNin).toHaveBeenCalledWith(
      '12345678901',
      expect.any(Object),
    );
    expect(result.nin).toBe('12345678901');
    expect(result.ninVerified).toBe(true);
    expect(result.ninVerifiedAt).toBeInstanceOf(Date);
  });

  it('rejects the update and leaves the profile unchanged when NIN verification fails', async () => {
    profilesRepository.findOne.mockResolvedValue(existingProfile());
    korapayService.verifyNin.mockResolvedValue({
      verified: false,
      reason: 'NIN not found',
    });

    await expect(
      service.update('user-1', { nin: '00000000000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(profilesRepository.save).not.toHaveBeenCalled();
  });

  it('stores and marks BVN verified when Korapay confirms it', async () => {
    profilesRepository.findOne.mockResolvedValue(existingProfile());
    korapayService.verifyBvn.mockResolvedValue({ verified: true });

    const result = await service.update('user-1', { bvn: '22222222222' });

    expect(result.bvn).toBe('22222222222');
    expect(result.bvnVerified).toBe(true);
  });

  it('does not re-verify NIN if the submitted value is unchanged', async () => {
    profilesRepository.findOne.mockResolvedValue(
      existingProfile({ nin: '12345678901', ninVerified: true }),
    );

    await service.update('user-1', {
      nin: '12345678901',
      firstName: 'Jane',
    });

    expect(korapayService.verifyNin).not.toHaveBeenCalled();
  });

  it('updates non-identity fields normally without touching verification', async () => {
    profilesRepository.findOne.mockResolvedValue(existingProfile());

    const result = await service.update('user-1', {
      firstName: 'Jane',
      lastName: 'Doe',
    });

    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('Doe');
    expect(korapayService.verifyNin).not.toHaveBeenCalled();
    expect(korapayService.verifyBvn).not.toHaveBeenCalled();
  });
});

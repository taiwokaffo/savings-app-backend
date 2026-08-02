import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import { AdminListQueryDto } from '../common/dto/admin-list-query.dto';

export interface PaginatedActivityLogs {
  data: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogRepository: Repository<ActivityLog>,
  ) {}

  /**
   * Fire-and-forget-safe: a logging failure should never break the
   * operation it's describing, so errors are swallowed (and logged).
   */
  async record(
    action: string,
    userId?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const log = this.activityLogRepository.create({
        userId: userId ?? null,
        action,
        metadata: metadata ?? null,
      });
      await this.activityLogRepository.save(log);
    } catch (err) {
      this.logger.error(
        `Failed to record activity log "${action}": ${err.message}`,
      );
    }
  }

  async findAll(query: AdminListQueryDto): Promise<PaginatedActivityLogs> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: FindOptionsWhere<ActivityLog> = {};
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;

    const [data, total] = await this.activityLogRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }
}

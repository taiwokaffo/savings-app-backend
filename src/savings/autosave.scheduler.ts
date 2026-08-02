import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SavingsService } from './savings.service';

@Injectable()
export class AutosaveScheduler {
  private readonly logger = new Logger(AutosaveScheduler.name);

  constructor(private readonly savingsService: SavingsService) {}

  // Runs once a day, just after midnight. Any plan whose nextAutosaveDate
  // is today (or earlier, e.g. after downtime) gets charged.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyAutosave() {
    const duePlans = await this.savingsService.findDuePlans();

    if (duePlans.length === 0) {
      return;
    }

    this.logger.log(`Processing autosave for ${duePlans.length} plan(s)`);

    let succeeded = 0;
    for (const plan of duePlans) {
      const ok = await this.savingsService.runAutosaveForPlan(plan);
      if (ok) succeeded++;
    }

    this.logger.log(
      `Autosave run complete: ${succeeded}/${duePlans.length} succeeded`,
    );
  }
}

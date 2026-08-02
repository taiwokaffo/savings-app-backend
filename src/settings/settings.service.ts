import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './entities/app-setting.entity';
import { SETTING_DEFAULTS, SettingKey } from './setting-keys';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingsRepository: Repository<AppSetting>,
  ) {}

  async findAll(): Promise<AppSetting[]> {
    const stored = await this.settingsRepository.find({
      order: { key: 'ASC' },
    });
    const storedKeys = new Set(stored.map((s) => s.key));

    // Surface known settings even before an admin has ever touched them,
    // so GET /admin/settings always shows the full, current configuration.
    const withDefaults = [...stored];
    for (const key of Object.values(SettingKey)) {
      if (!storedKeys.has(key)) {
        withDefaults.push({
          key,
          value: SETTING_DEFAULTS[key],
          updatedByUserId: null,
          updatedAt: null as unknown as Date,
        });
      }
    }
    return withDefaults;
  }

  /**
   * Returns the stored value for a key, falling back to its documented
   * default (or `undefined` for an unrecognized key with no override).
   */
  async getValue(key: SettingKey | string): Promise<string | undefined> {
    const setting = await this.settingsRepository.findOne({
      where: { key },
    });
    if (setting) return setting.value;
    return (SETTING_DEFAULTS as Record<string, string>)[key];
  }

  async getBoolean(key: SettingKey | string): Promise<boolean> {
    const value = await this.getValue(key);
    return value === 'true';
  }

  async upsert(
    key: string,
    value: string,
    updatedByUserId: string,
  ): Promise<AppSetting> {
    let setting = await this.settingsRepository.findOne({ where: { key } });
    if (!setting) {
      setting = this.settingsRepository.create({ key, value });
    } else {
      setting.value = value;
    }
    setting.updatedByUserId = updatedByUserId;
    return this.settingsRepository.save(setting);
  }
}

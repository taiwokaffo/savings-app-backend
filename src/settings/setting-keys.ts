/**
 * Known, documented setting keys. The store itself accepts any key (see
 * AppSetting), but these are the ones the app actually reads and reacts to.
 */
export enum SettingKey {
  // 'true' | 'false' — when 'true', SavingsService.withdraw() requires the
  // withdrawing user to have a verified BVN before releasing funds.
  REQUIRE_KYC_FOR_WITHDRAWAL = 'requireKycForWithdrawal',
}

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  [SettingKey.REQUIRE_KYC_FOR_WITHDRAWAL]: 'false',
};

export enum SavingsPlanType {
  REGULAR = 'REGULAR',
  TARGET = 'TARGET',
}

export enum SavingsPlanStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
  CLOSED = 'CLOSED',
}

export enum AutosaveFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum SavingsTransactionType {
  DEPOSIT = 'DEPOSIT',
  AUTOSAVE = 'AUTOSAVE',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum WalletTransactionType {
  FUND = 'FUND',
  DEBIT_TO_SAVINGS = 'DEBIT_TO_SAVINGS',
  CREDIT_FROM_SAVINGS = 'CREDIT_FROM_SAVINGS',
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SavingsPlan } from './savings-plan.entity';
import { SavingsTransactionType } from '../../common/enums/savings.enums';

@Entity('savings_transactions')
export class SavingsTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SavingsPlan, (plan) => plan.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'savingsPlanId' })
  savingsPlan: SavingsPlan;

  @Column()
  savingsPlanId: string;

  @Column({ type: 'enum', enum: SavingsTransactionType })
  type: SavingsTransactionType;

  @Column('decimal', { precision: 14, scale: 2 })
  amount: string;

  @Column('decimal', { precision: 14, scale: 2 })
  balanceAfter: string;

  @CreateDateColumn()
  createdAt: Date;
}

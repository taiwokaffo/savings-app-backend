import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SavingsTransaction } from './savings-transaction.entity';
import {
  AutosaveFrequency,
  SavingsPlanStatus,
  SavingsPlanType,
} from '../../common/enums/savings.enums';

@Entity('savings_plans')
export class SavingsPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.savingsPlans, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: SavingsPlanType })
  type: SavingsPlanType;

  @Column({
    type: 'enum',
    enum: SavingsPlanStatus,
    default: SavingsPlanStatus.ACTIVE,
  })
  status: SavingsPlanStatus;

  // Only relevant for TARGET plans
  @Column('decimal', { precision: 14, scale: 2, nullable: true })
  targetAmount: string | null;

  @Column({ type: 'date', nullable: true })
  targetDate: string | null;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  currentBalance: string;

  // Autosave configuration
  @Column({ default: false })
  autosaveEnabled: boolean;

  @Column({ type: 'enum', enum: AutosaveFrequency, nullable: true })
  autosaveFrequency: AutosaveFrequency | null;

  @Column('decimal', { precision: 14, scale: 2, nullable: true })
  autosaveAmount: string | null;

  @Column({ type: 'date', nullable: true })
  nextAutosaveDate: string | null;

  @OneToMany(() => SavingsTransaction, (tx) => tx.savingsPlan)
  transactions: SavingsTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

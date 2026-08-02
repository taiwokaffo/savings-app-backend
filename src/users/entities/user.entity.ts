import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { SavingsPlan } from '../../savings/entities/savings-plan.entity';
import { WalletTransaction } from '../../wallet/entities/wallet-transaction.entity';
import { Profile } from './profile.entity';
import { UserRole } from '../../common/enums/user.enums';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Exclude()
  @Column()
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  walletBalance: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  emailVerificationTokenHash: string | null;

  @Exclude()
  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpiresAt: Date | null;

  @OneToOne(() => Profile, (profile) => profile.user)
  profile: Profile;

  @OneToMany(() => SavingsPlan, (plan) => plan.user)
  savingsPlans: SavingsPlan[];

  @OneToMany(() => WalletTransaction, (tx) => tx.user)
  walletTransactions: WalletTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

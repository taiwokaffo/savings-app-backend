import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PaymentProvider, PaymentStatus } from '../../common/enums/payment.enums';

@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ unique: true })
  reference: string;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    default: PaymentProvider.PAYSTACK,
  })
  provider: PaymentProvider;

  // Amount in naira (NGN), matching the wallet's own currency-agnostic
  // decimal balance. Converted to kobo only at the Paystack API boundary.
  @Column('decimal', { precision: 14, scale: 2 })
  amount: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

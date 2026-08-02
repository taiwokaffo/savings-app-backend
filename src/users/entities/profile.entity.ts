import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude, Expose } from 'class-transformer';
import { User } from './user.entity';

@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  // Raw NIN/BVN are never serialized directly — see maskedNin/maskedBvn
  // below, which show only the last 4 digits.
  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  nin: string | null;

  @Column({ default: false })
  ninVerified: boolean;

  @Exclude()
  @Column({ type: 'timestamptz', nullable: true })
  ninVerifiedAt: Date | null;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  bvn: string | null;

  @Column({ default: false })
  bvnVerified: boolean;

  @Exclude()
  @Column({ type: 'timestamptz', nullable: true })
  bvnVerifiedAt: Date | null;

  @Expose()
  get maskedNin(): string | null {
    return maskLast4(this.nin);
  }

  @Expose()
  get maskedBvn(): string | null {
    return maskLast4(this.bvn);
  }

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

function maskLast4(value: string | null): string | null {
  if (!value) return null;
  return `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('activity_logs')
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nullable: a small number of actions (e.g. a webhook event that can't be
  // matched to a reference) aren't tied to an authenticated user.
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  // Free-form action code, e.g. 'USER_LOGIN', 'SAVINGS_DEPOSIT',
  // 'PAYMENT_SUCCESS'. Not an enum on purpose — new actions shouldn't
  // require a migration.
  @Column()
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}

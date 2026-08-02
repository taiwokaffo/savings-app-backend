import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_settings')
export class AppSetting {
  // The setting's key IS its primary key — simplest possible key/value store.
  @PrimaryColumn()
  key: string;

  // Always stored as text; consumers parse it (e.g. 'true'/'false' for
  // booleans) since settings can hold arbitrary small values without a
  // migration for every new type.
  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}

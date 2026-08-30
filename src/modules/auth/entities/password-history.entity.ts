import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('password_history')
@Index(['userId', 'createdAt'], { order: { createdAt: 'DESC' } })
export class PasswordHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;
}

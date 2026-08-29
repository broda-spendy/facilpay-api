import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  EXPIRED = 'EXPIRED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column()
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ nullable: true })
  externalReference: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'varchar', nullable: true, length: 2048 })
  callbackUrl: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  refundedAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  feeAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  netAmount: number;

  @Column({ nullable: true })
  feeBreakdown: string | null = null;

  @Column({ nullable: true })
  cancelledAt: Date | null = null;

  @Column({ nullable: true })
  expiresAt: Date | null = null;

  @Column({ nullable: true })
  expiredAt: Date | null = null;

  @Column({ nullable: true })
  merchantId: string | null = null;

  @Column({ nullable: true })
  merchantEmail: string | null = null;

  @Column({ nullable: true })
  payerEmail: string | null = null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, string> | null = null;

  @Index()
  @Column({ nullable: true })
  settlementId: string | null = null;

  /**
   * Unique shareable token used to access the invoice PDF without authentication.
   * Generated on first invoice request and stored here for subsequent access.
   */
  @Index({ unique: true, where: '"invoiceToken" IS NOT NULL' })
  @Column({ nullable: true, unique: true })
  invoiceToken: string | null = null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

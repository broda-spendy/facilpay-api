import { IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RedeemPaymentLinkDto {
  @IsNumber()
  @IsOptional()
  @IsPositive()
  @Min(0.01)
  @ApiPropertyOptional({ description: 'Payer-supplied amount (required for flexible-amount links)', example: 25.0 })
  payerAmount?: number;
}

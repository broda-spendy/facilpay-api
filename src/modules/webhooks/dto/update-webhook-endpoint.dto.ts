import { IsUrl, IsArray, ArrayNotEmpty, IsEnum, ArrayUnique, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WEBHOOK_EVENT_TYPES, WebhookEventType } from '../entities/webhook-endpoint.entity';

export class UpdateWebhookEndpointDto {
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'url must be a valid HTTPS URL' })
  @ApiPropertyOptional({
    description: 'New HTTPS URL for this endpoint',
    example: 'https://merchant.example.com/webhooks/v2',
  })
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one event type must be specified' })
  @ArrayUnique()
  @IsEnum(WEBHOOK_EVENT_TYPES, {
    each: true,
    message: `Each event must be one of: ${WEBHOOK_EVENT_TYPES.join(', ')}`,
  })
  @ApiPropertyOptional({
    description: 'Replacement set of event subscriptions',
    enum: WEBHOOK_EVENT_TYPES,
    isArray: true,
    example: ['payment.completed', 'refund.issued'],
  })
  events?: WebhookEventType[];

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Enable or disable the endpoint without deleting it',
    example: false,
  })
  isActive?: boolean;
}

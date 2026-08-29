import { IsUrl, IsArray, ArrayNotEmpty, IsEnum, ArrayUnique } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WEBHOOK_EVENT_TYPES, WebhookEventType } from '../entities/webhook-endpoint.entity';

export class CreateWebhookEndpointDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'url must be a valid HTTPS URL' })
  @ApiProperty({
    description: 'HTTPS URL that will receive webhook POST requests',
    example: 'https://merchant.example.com/webhooks',
  })
  url: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'At least one event type must be specified' })
  @ArrayUnique()
  @IsEnum(WEBHOOK_EVENT_TYPES, {
    each: true,
    message: `Each event must be one of: ${WEBHOOK_EVENT_TYPES.join(', ')}`,
  })
  @ApiProperty({
    description: 'Event types this endpoint subscribes to',
    enum: WEBHOOK_EVENT_TYPES,
    isArray: true,
    example: ['payment.created', 'payment.completed'],
  })
  events: WebhookEventType[];
}

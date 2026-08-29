import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  @ApiProperty({
    description: 'Email address to resend the verification link to',
    example: 'user@example.com',
  })
  email: string;
}

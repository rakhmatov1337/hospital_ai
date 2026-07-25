import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A patient message to the assistant. `message` is free text FROM the patient —
 * this is the one deliberate free-text input in the product, and it is safe only
 * because the assistant service wraps it in the input/output guards (SP7). It is
 * never used as a clinical signal: symptom reports are routed to the structured
 * check-in, never assessed.
 */
export class SendMessageDto {
  @ApiPropertyOptional({ description: 'Existing thread to continue. Omit to start a new one.' })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiProperty({ description: "The patient's message.", maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}

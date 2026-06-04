import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  content!: string;
}

export class ChatRequestDto {
  @ApiProperty({ type: [ChatMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiPropertyOptional({ description: 'Patient id — enables persistent memory' })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Conversation/thread id for memory' })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({ example: 'cesarean' })
  @IsOptional()
  @IsString()
  surgeryType?: string;

  @ApiPropertyOptional({ description: 'Days since surgery', example: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  recoveryDay?: number;
}

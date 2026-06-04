import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant', 'system'], example: 'user' })
  @IsIn(['user', 'assistant', 'system'])
  role!: 'user' | 'assistant' | 'system';

  @ApiProperty({ example: 'Can I take a bath on day 4 after my appendix surgery?' })
  @IsString()
  content!: string;
}

export class ChatDto {
  @ApiProperty({ type: [ChatMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CheckInDto {
  @ApiProperty({ example: 4, minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(10)
  painLevel!: number;

  @ApiPropertyOptional({ example: 37.2 })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ example: ['mild nausea'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @ApiPropertyOptional({ example: 'tired' })
  @IsOptional()
  @IsString()
  mood?: string;

  @ApiPropertyOptional({ example: 78 })
  @IsOptional()
  @IsInt()
  bpm?: number;

  @ApiPropertyOptional({ example: 98 })
  @IsOptional()
  @IsInt()
  spo2?: number;
}

export class CompleteItemDto {
  @ApiPropertyOptional({
    example: '08:00',
    description: 'Which scheduled time was completed (omit for untimed items).',
  })
  @IsOptional()
  @IsString()
  scheduleTime?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

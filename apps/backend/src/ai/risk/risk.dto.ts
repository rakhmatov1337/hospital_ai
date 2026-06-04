import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CheckInDto {
  @ApiProperty({ minimum: 0, maximum: 10, example: 7 })
  @IsInt()
  @Min(0)
  @Max(10)
  painLevel!: number;

  @ApiPropertyOptional({ example: 38.6, description: 'Body temperature °C' })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ type: [String], example: ['heavy bleeding', 'chills'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @ApiPropertyOptional({ example: 'anxious' })
  @IsOptional()
  @IsString()
  mood?: string;

  @ApiPropertyOptional({ example: 2, description: 'Days since surgery' })
  @IsOptional()
  @IsInt()
  @Min(0)
  recoveryDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

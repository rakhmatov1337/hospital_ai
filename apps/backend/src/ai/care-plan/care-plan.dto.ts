import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString } from 'class-validator';

export class GenerateCarePlanDto {
  @ApiProperty({ example: 'cesarean' })
  @IsString()
  surgeryType!: string;

  @ApiProperty({ example: '2026-06-01', description: 'Surgery date (ISO)' })
  @IsDateString()
  surgeryDate!: string;
}

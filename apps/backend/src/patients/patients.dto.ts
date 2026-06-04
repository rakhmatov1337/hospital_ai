import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({ example: 'Nilufar Tosheva' })
  @IsString()
  fullName!: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Surgery type id (from GET /surgery-types)' })
  @IsUUID()
  surgeryTypeId!: string;

  @ApiProperty({ example: '2026-06-01', description: 'Surgery date (ISO)' })
  @IsDateString()
  surgeryDate!: string;
}

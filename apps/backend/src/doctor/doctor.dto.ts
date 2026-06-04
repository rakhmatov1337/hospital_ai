import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({ example: 'Nodira Yusupova' })
  @IsString()
  fullName!: string;

  @ApiPropertyOptional({ example: 'nodira@mail.ru' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '+998901111111' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  age?: number;

  @ApiProperty({ example: 'uuid-of-appendectomy' })
  @IsString()
  surgeryTypeId!: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  surgeryDate!: string;
}

export class UpdatePatientDto {
  @ApiPropertyOptional({ enum: ['PRE_OP', 'RECOVERING', 'RECOVERED', 'AT_RISK'] })
  @IsOptional()
  @IsIn(['PRE_OP', 'RECOVERING', 'RECOVERED', 'AT_RISK'])
  status?: 'PRE_OP' | 'RECOVERING' | 'RECOVERED' | 'AT_RISK';
}

export class CarePlanItemDto {
  @ApiProperty({ enum: ['MEDICATION', 'EXERCISE', 'DIET', 'RESTRICTION'] })
  @IsIn(['MEDICATION', 'EXERCISE', 'DIET', 'RESTRICTION'])
  type!: 'MEDICATION' | 'EXERCISE' | 'DIET' | 'RESTRICTION';

  @ApiProperty({ example: 'Ibuprofen 400mg' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'Take with food to reduce inflammation.' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ example: '400mg' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ example: 'twice daily' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ example: ['08:00', '20:00'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scheduleTimes?: string[];

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  startDay?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  durationDays?: number;
}

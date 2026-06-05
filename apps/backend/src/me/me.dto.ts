import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
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

export class ComplaintDto {
  @ApiProperty({
    enum: ['DOCTOR', 'NURSE', 'SERVICE', 'FACILITY', 'MEDICATION', 'OTHER'],
    description:
      'Shifokor=DOCTOR, Hamshira=NURSE, Xizmat=SERVICE, Muassasa=FACILITY, Dori=MEDICATION, Boshqa=OTHER',
  })
  @IsIn(['DOCTOR', 'NURSE', 'SERVICE', 'FACILITY', 'MEDICATION', 'OTHER'])
  category!: 'DOCTOR' | 'NURSE' | 'SERVICE' | 'FACILITY' | 'MEDICATION' | 'OTHER';

  @ApiProperty({ maxLength: 500, example: 'Nima boʻlganini tasvirlab bering...' })
  @IsString()
  @MaxLength(500)
  description!: string;

  @ApiProperty({
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    description: "Past=LOW, O'rta=MEDIUM, Yuqori=HIGH",
  })
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  urgency!: 'LOW' | 'MEDIUM' | 'HIGH';
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

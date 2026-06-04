import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateHospitalDto {
  @ApiProperty({ example: 'Tashkent Central Hospital' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Amir Temur Ave 1' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Tashkent' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'Hospital Admin' })
  @IsString()
  adminFullName!: string;

  @ApiProperty({ example: 'hospital@hospital.ai' })
  @IsString()
  adminEmail!: string;

  @ApiProperty({ example: 'hospital123' })
  @IsString()
  @MinLength(6)
  adminPassword!: string;
}

export class CreateSurgeryTypeDto {
  @ApiProperty({ example: 'Appendectomy' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Аппендэктомия' })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ example: 'Appendektomiya' })
  @IsOptional()
  @IsString()
  nameUz?: string;

  @ApiPropertyOptional({ example: 'general' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 21 })
  @IsOptional()
  @IsInt()
  avgRecoveryDays?: number;

  @ApiPropertyOptional({ example: 'appendectomy_kb' })
  @IsOptional()
  @IsString()
  kbIndex?: string;
}

export class UploadKbDto {
  @ApiProperty({ example: 'uuid-of-surgery-type' })
  @IsString()
  surgeryTypeId!: string;

  @ApiProperty({ example: 'Appendectomy Recovery Guide' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ example: 'NHS' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'Open Government Licence' })
  @IsOptional()
  @IsString()
  license?: string;
}

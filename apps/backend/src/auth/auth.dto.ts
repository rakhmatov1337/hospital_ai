import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'demo@hospital.ai' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo123' })
  @IsString()
  password!: string;
}

export class PatientLoginDto {
  @ApiProperty({ example: 'HOSP-1234', description: 'Patient access code' })
  @IsString()
  accessCode!: string;
}

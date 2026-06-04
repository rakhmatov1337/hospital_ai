import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Dr. Aziza Karimova' })
  @IsString()
  fullName!: string;

  @ApiProperty({ example: 'demo@hospital.ai' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo123' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'demo@hospital.ai' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo123' })
  @IsString()
  password!: string;
}

export class PatientLoginDto {
  @ApiProperty({ example: '123456', description: '6-digit access code' })
  @IsString()
  accessCode!: string;
}

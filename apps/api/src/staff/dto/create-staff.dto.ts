import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { StaffRole } from '@hospital-ai/shared-types';

/**
 * Create a staff account (D7). `clinic_id` is never a field — the new account is
 * bound to the authenticated clinical lead's clinic (RequestContext). The password
 * is bcrypt-hashed server-side and never stored or returned in the clear.
 */
export class CreateStaffDto {
  @ApiProperty({ example: 'Dr. A. Karimova' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'nurse@clinic.example' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'a-strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: StaffRole, example: StaffRole.staff })
  @IsEnum(StaffRole)
  role!: StaffRole;
}

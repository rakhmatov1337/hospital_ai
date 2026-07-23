import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Staff login: email + password (bcrypt-verified). */
export class StaffLoginDto {
  @ApiProperty({ example: 'nurse@sehat.example' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password!: string;
}

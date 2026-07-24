import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Body for `PATCH /v1/clinics/me` (D7). Every field is optional — a partial update.
 *
 * Changes to `name`, `phone` and `emergencyNumber` are patient-facing (they are
 * interpolated into safety strings) and are AUDIT-LOGGED with actor + timestamp
 * (append-only AuditLog). Working hours changes take effect immediately for tier
 * routing. `clinic_id` is never a field — the clinic is the authenticated token's.
 */
export class UpdateClinicDto {
  @ApiPropertyOptional({ description: 'Clinic name (patient-facing — audit-logged on change).' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Clinic phone (patient-facing — audit-logged on change).' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ description: 'Local emergency number (patient-facing — audit-logged on change).' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  emergencyNumber?: string;

  @ApiPropertyOptional({ example: '09:00-18:00' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workingHours?: string;

  @ApiPropertyOptional({ example: 'Mon-Sat' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workingDays?: string;

  @ApiPropertyOptional({ description: 'On-duty contact number.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  onDutyContact?: string;

  @ApiPropertyOptional({ description: 'Backup contact number.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  backupContact?: string;

  @ApiPropertyOptional({ description: 'Head-of-clinic contact number.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  headContact?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440, description: 'Minutes before the first escalation notification.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  notifyMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440, description: 'Minutes allowed before an unacknowledged escalation is chased.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  ackMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440, description: 'Minutes before an unacknowledged escalation is marked breached.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  breachMinutes?: number;
}

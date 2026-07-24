import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class DraftPlanDto {
  @ApiProperty({
    example: 'laparoscopic_appendectomy',
    description: 'Procedure type to draft a recovery-plan template for.',
  })
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'procedureType must be a lower_snake_case identifier',
  })
  procedureType!: string;
}

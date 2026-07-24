import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for `POST /v1/me/consent` (P4). The patient confirms the consent version
 * they accepted in-app. The `text_snapshot` is resolved SERVER-SIDE from the
 * approved onboarding consent content (never taken from the client), so a client
 * can never rewrite what the patient is recorded as having agreed to.
 */
export class ConsentDto {
  @ApiProperty({
    description: 'The consent document version the patient accepted, e.g. "v1".',
    example: 'v1',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  version!: string;
}

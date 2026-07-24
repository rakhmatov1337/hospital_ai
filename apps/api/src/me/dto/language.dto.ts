import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Language } from '@hospital-ai/shared-types';

/**
 * Body for `PATCH /v1/me/language` (P16). The patient may change their app
 * language at any time; the change is instant (per MVP scope) and the enum is
 * validated against the three supported languages.
 */
export class LanguageDto {
  @ApiProperty({ enum: Language, description: 'The language to switch to.' })
  @IsEnum(Language)
  language!: Language;
}

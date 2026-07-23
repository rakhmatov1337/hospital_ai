import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Language, ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { ContentService, ResolvedContent } from './content.service';

/**
 * Content-library read API (available to both audiences — patient and staff).
 *
 * GET /v1/content/:key?lang=UZ|RU|EN
 * Returns the approved translation for the exact language, or CONTENT_NOT_APPROVED.
 * The language MUST be supplied explicitly — the resolver never falls back.
 */
@ApiTags('content')
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get(':key')
  @ApiOperation({ summary: 'Resolve an approved content string by key + language' })
  @ApiQuery({ name: 'lang', enum: Language, required: true })
  @ApiOkResponse({ description: 'Approved content resolved for the requested language.' })
  resolve(
    @Param('key') key: string,
    @Query('lang') lang?: string,
  ): Promise<ResolvedContent> {
    const language = this.parseLanguage(lang);
    return this.contentService.resolve(key, language);
  }

  private parseLanguage(lang?: string): Language {
    if (lang && (Object.values(Language) as string[]).includes(lang)) {
      return lang as Language;
    }
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'Query parameter "lang" is required and must be one of UZ, RU, EN.',
      { lang },
    );
  }
}

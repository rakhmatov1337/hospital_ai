import { Injectable } from '@nestjs/common';
import { ContentStatus, Language, ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** Result of a successful content resolution — carries no fallback text. */
export interface ResolvedContent {
  contentKey: string;
  language: Language;
  text: string;
  version: number;
  isPlaceholder: boolean;
}

/**
 * Content-library resolver.
 *
 * resolve(contentKey, language) returns ONLY a `status=approved` translation for
 * the EXACT language requested. There is NO fallback language and NO fallback
 * text: a missing or unapproved key throws CONTENT_NOT_APPROVED (fail-closed).
 *
 * Placeholder rule (production gate): when ALLOW_PLACEHOLDER_CONTENT is not
 * "true", placeholder translations fail closed exactly like unapproved content.
 *
 * Clinic scoping: ContentItem.clinic_id is nullable (null = global/shared), so
 * it is excluded from the blanket tenancy extension. Scoping is applied here —
 * a clinic-specific item is preferred over the global one for the same key. This
 * is preference, not language/text fallback: global content is legitimately
 * shared, never a substitute for a missing approved translation.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  async resolve(contentKey: string, language: Language): Promise<ResolvedContent> {
    const clinicId = this.ctx.clinicId;
    const allowPlaceholder = process.env.ALLOW_PLACEHOLDER_CONTENT === 'true';

    const items = await this.prisma.contentItem.findMany({
      where: {
        contentKey,
        OR: clinicId ? [{ clinicId }, { clinicId: null }] : [{ clinicId: null }],
      },
      include: {
        translations: {
          where: { language, status: ContentStatus.approved },
          orderBy: { version: 'desc' },
        },
      },
    });

    // Prefer a clinic-specific item over the global one for the same key.
    const ordered = [...items].sort(
      (a, b) => (a.clinicId ? 0 : 1) - (b.clinicId ? 0 : 1),
    );

    for (const item of ordered) {
      const translation = item.translations.find(
        (t) => allowPlaceholder || !t.isPlaceholder,
      );
      if (translation) {
        return {
          contentKey,
          language,
          text: translation.text,
          version: translation.version,
          isPlaceholder: translation.isPlaceholder,
        };
      }
    }

    throw new AppError(
      ERROR_CODES.CONTENT_NOT_APPROVED,
      'Requested content is not approved for the requested language.',
      { contentKey, language },
    );
  }
}

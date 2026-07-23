import { ContentStatus, Language, ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { ContentService } from './content.service';

/**
 * Unit tests for the fail-closed content resolver:
 *  - approved translation -> returns text
 *  - only-draft (unapproved) -> CONTENT_NOT_APPROVED
 *  - placeholder with ALLOW_PLACEHOLDER_CONTENT=false -> fails closed
 *  - placeholder with ALLOW_PLACEHOLDER_CONTENT=true  -> returns text
 *  - clinic-specific approved item preferred over the global one
 */
describe('ContentService.resolve', () => {
  const ORIGINAL_ENV = process.env.ALLOW_PLACEHOLDER_CONTENT;

  let findMany: jest.Mock;
  let service: ContentService;
  let ctxClinicId: string | undefined;

  const buildTranslation = (over: Partial<{
    text: string;
    version: number;
    status: ContentStatus;
    isPlaceholder: boolean;
    language: Language;
  }> = {}) => ({
    id: 't1',
    text: over.text ?? 'Approved text',
    version: over.version ?? 1,
    status: over.status ?? ContentStatus.approved,
    isPlaceholder: over.isPlaceholder ?? false,
    language: over.language ?? Language.EN,
  });

  const buildItem = (over: Partial<{ clinicId: string | null; translations: unknown[] }> = {}) => ({
    id: 'i1',
    clinicId: over.clinicId ?? null,
    contentKey: 'onboarding.welcome',
    status: ContentStatus.approved,
    translations: over.translations ?? [buildTranslation()],
  });

  beforeEach(() => {
    findMany = jest.fn();
    ctxClinicId = undefined;
    const prisma = { contentItem: { findMany } } as unknown as PrismaService;
    const ctx = {
      get clinicId() {
        return ctxClinicId;
      },
    } as unknown as RequestContext;
    service = new ContentService(prisma, ctx);
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ALLOW_PLACEHOLDER_CONTENT;
    else process.env.ALLOW_PLACEHOLDER_CONTENT = ORIGINAL_ENV;
  });

  it('returns the approved translation text for the exact language', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    findMany.mockResolvedValue([buildItem()]);

    const result = await service.resolve('onboarding.welcome', Language.EN);

    expect(result.text).toBe('Approved text');
    expect(result.language).toBe(Language.EN);
    expect(result.isPlaceholder).toBe(false);
    // Only approved translations are ever queried (fail-closed by query shape).
    const arg = findMany.mock.calls[0][0];
    expect(arg.include.translations.where.status).toBe(ContentStatus.approved);
  });

  it('throws CONTENT_NOT_APPROVED when no approved translation exists', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'true';
    // The query filters status=approved, so an unapproved key yields no translations.
    findMany.mockResolvedValue([buildItem({ translations: [] })]);

    await expect(service.resolve('onboarding.welcome', Language.EN)).rejects.toMatchObject({
      code: ERROR_CODES.CONTENT_NOT_APPROVED,
    });
    await expect(service.resolve('onboarding.welcome', Language.EN)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('throws CONTENT_NOT_APPROVED for a missing key (no items)', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'true';
    findMany.mockResolvedValue([]);

    await expect(service.resolve('missing.key', Language.RU)).rejects.toMatchObject({
      code: ERROR_CODES.CONTENT_NOT_APPROVED,
    });
  });

  it('fails closed on a placeholder translation when ALLOW_PLACEHOLDER_CONTENT=false', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    findMany.mockResolvedValue([
      buildItem({ translations: [buildTranslation({ isPlaceholder: true })] }),
    ]);

    await expect(service.resolve('onboarding.welcome', Language.EN)).rejects.toMatchObject({
      code: ERROR_CODES.CONTENT_NOT_APPROVED,
    });
  });

  it('returns a placeholder translation when ALLOW_PLACEHOLDER_CONTENT=true', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'true';
    findMany.mockResolvedValue([
      buildItem({
        translations: [buildTranslation({ isPlaceholder: true, text: 'Placeholder text' })],
      }),
    ]);

    const result = await service.resolve('onboarding.welcome', Language.EN);

    expect(result.text).toBe('Placeholder text');
    expect(result.isPlaceholder).toBe(true);
  });

  it('prefers a clinic-specific approved item over the global one', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    ctxClinicId = 'clinic-a';
    findMany.mockResolvedValue([
      buildItem({ clinicId: null, translations: [buildTranslation({ text: 'Global' })] }),
      buildItem({ clinicId: 'clinic-a', translations: [buildTranslation({ text: 'Clinic' })] }),
    ]);

    const result = await service.resolve('onboarding.welcome', Language.EN);

    expect(result.text).toBe('Clinic');
  });

  it('scopes the query to the clinic + global when a clinic is in context', async () => {
    process.env.ALLOW_PLACEHOLDER_CONTENT = 'false';
    ctxClinicId = 'clinic-a';
    findMany.mockResolvedValue([buildItem({ clinicId: 'clinic-a' })]);

    await service.resolve('onboarding.welcome', Language.EN);

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([{ clinicId: 'clinic-a' }, { clinicId: null }]);
  });
});

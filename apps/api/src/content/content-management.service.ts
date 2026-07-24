import { Injectable } from '@nestjs/common';
import { ContentItem, ContentTranslation } from '@prisma/client';
import {
  ContentActionResult,
  ContentItemDetail,
  ContentLanguageState,
  ContentListItem,
  ContentReviewStatus,
  ContentStatus,
  ContentTranslationView,
  ERROR_CODES,
  Language,
  UnapprovedCountResult,
} from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';
import { Clock } from '../common/clock';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { RequestChangesDto } from './dto/request-changes.dto';

/** The three programme languages, in the D8 side-by-side display order. */
const LANGUAGES: Language[] = [Language.EN, Language.UZ, Language.RU];

type ItemWithTranslations = ContentItem & { translations: ContentTranslation[] };

/**
 * Content approval management (D8 — the clinical-lead safety line).
 *
 * Scoping mirrors the resolver: an item is visible to a clinic when it is the
 * clinic's own item OR a global (clinic_id null) item. Approvals are per item PER
 * language (approving EN never approves UZ), gated to the `clinical_lead` role, and
 * recorded permanently in the append-only AuditLog. Immutability is preserved: an
 * already-approved translation row is NEVER mutated — approving a placeholder
 * supersedes it with a new real approved version, and requesting changes creates a
 * new Draft version (the SP1 immutability guard freezes approved rows).
 */
@Injectable()
export class ContentManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly clock: Clock,
  ) {}

  /** List every content item visible to the clinic, with derived review state. */
  async list(): Promise<ContentListItem[]> {
    const items = await this.visibleItems();
    return items.map((item) => this.toListItem(item));
  }

  /** The launch-blocker badge: how many visible items still need approval. */
  async unapprovedCount(): Promise<UnapprovedCountResult> {
    const items = await this.visibleItems();
    const unapprovedItems = items.filter((item) => this.needsApproval(item)).length;
    return { unapprovedItems, totalItems: items.length };
  }

  /** One item: the three languages side by side, each with its full version history. */
  async itemDetail(id: string): Promise<ContentItemDetail> {
    const item = await this.prisma.contentItem.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!item) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Content item not found.', { id });
    }
    this.assertVisible(item.clinicId);

    const languages: ContentLanguageState[] = LANGUAGES.map((language) => {
      const history = item.translations
        .filter((t) => t.language === language)
        .sort((a, b) => b.version - a.version)
        .map(toTranslationView);
      const current = history[0] ?? null;
      return {
        language,
        present: history.length > 0,
        reviewStatus: current ? current.reviewStatus : 'missing',
        current,
        history,
      };
    });

    return {
      id: item.id,
      clinicId: item.clinicId,
      category: item.category,
      contentKey: item.contentKey,
      status: this.itemStatus(item),
      languages,
    };
  }

  /**
   * Approve one translation (per item PER language; clinical_lead only). Never
   * mutates an existing real-approved row:
   *  - a draft is promoted in place (the immutability guard allows it — it is draft);
   *  - a placeholder (approved-status but no real sign-off) is superseded by a new,
   *    real approved version above it.
   * Records a permanent AuditLog entry (approvals are immutable records).
   */
  async approve(translationId: string): Promise<ContentActionResult> {
    this.ctx.requireClinicalLead();
    const clinicId = this.ctx.requireClinicId();
    const { translation, item } = await this.loadTranslation(translationId);

    if (reviewStatusOf(translation) === 'approved') {
      throw new AppError(
        ERROR_CODES.DUPLICATE_REQUEST,
        'This translation is already approved.',
        { translationId },
      );
    }

    const now = this.clock.now();
    const approver = this.ctx.staffId ?? 'staff';

    let result: ContentTranslation;
    if (translation.status === ContentStatus.draft) {
      result = await this.prisma.contentTranslation.update({
        where: { id: translationId },
        data: {
          status: ContentStatus.approved,
          isPlaceholder: false,
          approvedBy: approver,
          approvedAt: now,
        },
      });
    } else {
      // Approved-status placeholder — frozen; supersede with a new real approved version.
      const version = await this.nextVersion(
        translation.contentItemId,
        translation.language as Language,
      );
      result = await this.prisma.contentTranslation.create({
        data: {
          contentItemId: translation.contentItemId,
          language: translation.language,
          text: translation.text,
          version,
          status: ContentStatus.approved,
          isPlaceholder: false,
          approvedBy: approver,
          approvedAt: now,
        },
      });
    }

    await this.recordAudit(clinicId, item.id, translationId, 'approve', `${translation.language} v${result.version}`);
    await this.refreshItemStatus(item.id);
    return toActionResult(result);
  }

  /**
   * Request changes to a translation (clinical_lead only): the "edit approved ->
   * new Draft version" flow. Creates a NEW draft version from the current (or a
   * proposed) text without ever mutating the immutable approved row, reverting the
   * item to needs-review. The reviewer note is recorded to the append-only AuditLog.
   */
  async requestChanges(
    translationId: string,
    dto: RequestChangesDto,
  ): Promise<ContentActionResult> {
    this.ctx.requireClinicalLead();
    const clinicId = this.ctx.requireClinicId();
    const { translation, item } = await this.loadTranslation(translationId);

    const version = await this.nextVersion(
      translation.contentItemId,
      translation.language as Language,
    );
    const draft = await this.prisma.contentTranslation.create({
      data: {
        contentItemId: translation.contentItemId,
        language: translation.language,
        text: dto.text ?? translation.text,
        version,
        status: ContentStatus.draft,
        isPlaceholder: false,
        approvedBy: null,
        approvedAt: null,
      },
    });

    await this.recordAudit(
      clinicId,
      item.id,
      translationId,
      'request_changes',
      dto.note ?? null,
    );
    await this.refreshItemStatus(item.id);
    return toActionResult(draft);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async visibleItems(): Promise<ItemWithTranslations[]> {
    const clinicId = this.ctx.requireClinicId();
    return this.prisma.contentItem.findMany({
      where: { OR: [{ clinicId }, { clinicId: null }] },
      include: { translations: true },
      orderBy: [{ category: 'asc' }, { contentKey: 'asc' }],
    });
  }

  private async loadTranslation(
    translationId: string,
  ): Promise<{ translation: ContentTranslation; item: ContentItem }> {
    const translation = await this.prisma.contentTranslation.findUnique({
      where: { id: translationId },
      include: { contentItem: true },
    });
    if (!translation) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Content translation not found.', {
        translationId,
      });
    }
    this.assertVisible(translation.contentItem.clinicId);
    return { translation, item: translation.contentItem };
  }

  private assertVisible(itemClinicId: string | null): void {
    const clinicId = this.ctx.requireClinicId();
    if (itemClinicId !== null && itemClinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'This content item belongs to another clinic.',
      );
    }
  }

  private async nextVersion(contentItemId: string, language: Language): Promise<number> {
    const top = await this.prisma.contentTranslation.findFirst({
      where: { contentItemId, language },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (top?.version ?? 0) + 1;
  }

  /** Recompute the item-level status from its current translations (mutable row). */
  private async refreshItemStatus(itemId: string): Promise<void> {
    const item = await this.prisma.contentItem.findUnique({
      where: { id: itemId },
      include: { translations: true },
    });
    if (!item) return;
    const status =
      this.itemStatus(item) === 'approved' ? ContentStatus.approved : ContentStatus.draft;
    if (item.status !== status) {
      await this.prisma.contentItem.update({ where: { id: itemId }, data: { status } });
    }
  }

  private async recordAudit(
    clinicId: string,
    itemId: string,
    translationId: string,
    field: string,
    note: string | null,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        clinicId,
        actorId: this.ctx.staffId ?? null,
        actorRole: this.ctx.role ?? null,
        entity: 'content_translation',
        entityId: translationId,
        field,
        oldValue: itemId,
        newValue: note,
      },
    });
  }

  private toListItem(item: ItemWithTranslations): ContentListItem {
    const currents = this.currentByLanguage(item);
    const languagesPresent = LANGUAGES.filter((l) => currents[l]);
    const missingLanguages = LANGUAGES.filter((l) => !currents[l]);
    const last = this.lastApproval(item);

    return {
      id: item.id,
      clinicId: item.clinicId,
      category: item.category,
      contentKey: item.contentKey,
      status: this.itemStatus(item),
      languagesPresent,
      missingLanguages,
      needsApproval: this.needsApproval(item),
      lastApprovedBy: last?.approvedBy ?? null,
      lastApprovedAt: last?.approvedAt ? last.approvedAt.toISOString() : null,
    };
  }

  /** The current (highest-version) translation per language, if present. */
  private currentByLanguage(
    item: ItemWithTranslations,
  ): Partial<Record<Language, ContentTranslation>> {
    const out: Partial<Record<Language, ContentTranslation>> = {};
    for (const language of LANGUAGES) {
      const current = item.translations
        .filter((t) => t.language === language)
        .sort((a, b) => b.version - a.version)[0];
      if (current) out[language] = current;
    }
    return out;
  }

  /** 'approved' only when every language is present AND its current row is really approved. */
  private itemStatus(item: ItemWithTranslations): 'approved' | 'needs_review' {
    const currents = this.currentByLanguage(item);
    const allApproved = LANGUAGES.every(
      (l) => currents[l] && reviewStatusOf(currents[l] as ContentTranslation) === 'approved',
    );
    return allApproved ? 'approved' : 'needs_review';
  }

  private needsApproval(item: ItemWithTranslations): boolean {
    return this.itemStatus(item) === 'needs_review';
  }

  /** The most recent real approval (by approvedAt) across the item's translations. */
  private lastApproval(item: ItemWithTranslations): ContentTranslation | null {
    return item.translations
      .filter((t) => t.status === ContentStatus.approved && !t.isPlaceholder && t.approvedAt)
      .sort((a, b) => (b.approvedAt as Date).getTime() - (a.approvedAt as Date).getTime())[0] ?? null;
  }
}

/** Derive the review status of one translation row. */
export function reviewStatusOf(t: {
  status: string;
  isPlaceholder: boolean;
}): ContentReviewStatus {
  if (t.status === ContentStatus.draft) return 'draft';
  return t.isPlaceholder ? 'needs_review' : 'approved';
}

function toTranslationView(t: ContentTranslation): ContentTranslationView {
  return {
    id: t.id,
    language: t.language as Language,
    text: t.text,
    version: t.version,
    status: t.status as ContentStatus,
    reviewStatus: reviewStatusOf(t),
    isPlaceholder: t.isPlaceholder,
    approvedBy: t.approvedBy,
    approvedAt: t.approvedAt ? t.approvedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

function toActionResult(t: ContentTranslation): ContentActionResult {
  return {
    translationId: t.id,
    contentItemId: t.contentItemId,
    language: t.language as Language,
    version: t.version,
    status: t.status as ContentStatus,
    reviewStatus: reviewStatusOf(t),
    approvedBy: t.approvedBy,
    approvedAt: t.approvedAt ? t.approvedAt.toISOString() : null,
  };
}

import { ContentStatus, PrismaClient } from '@prisma/client';

/**
 * The approved-content catalogue — the CLOSED SET the care-plan selector may
 * choose from.
 *
 * Deliberately free of any `@mastra/*` import: the Mastra tool wraps these
 * functions, and the service validates against them, but neither the service nor
 * its tests should have to load the agent framework (which ships ESM-only deps).
 */

let client: PrismaClient | null = null;
function db(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

/**
 * Clinical content is namespaced `clinical.{procedure}.{topic}`; everything else
 * (medication.*, wound_care.*, activity.*, checkin.*) is procedure-agnostic. We
 * expose the agnostic keys plus ONLY the requested procedure's clinical keys, so
 * a plan can never pull in another procedure's clinical content.
 */
export function isKeyAvailableForProcedure(contentKey: string, procedureType: string): boolean {
  if (!contentKey.startsWith('clinical.')) return true;
  return contentKey.startsWith(`clinical.${procedureType}.`);
}

/** Approved, procedure-relevant content keys. Shared by the tool and the validator. */
export async function fetchApprovedContentKeys(
  procedureType: string,
  prisma?: PrismaClient,
): Promise<{ contentKey: string; category: string }[]> {
  const p = prisma ?? db();
  const items = await p.contentItem.findMany({
    where: { status: ContentStatus.approved },
    select: { contentKey: true, category: true },
    orderBy: { contentKey: 'asc' },
  });
  return items.filter((i) => isKeyAvailableForProcedure(i.contentKey, procedureType));
}

export type CatalogLanguage = 'EN' | 'RU' | 'UZ';

export interface ApprovedContentChunk {
  contentKey: string;
  category: string;
  /** The APPROVED translation in the requested language (never a fallback). */
  text: string;
}

/**
 * SP7 retrieval: the approved content the patient-assistant may quote FROM.
 *
 * Returns clinician-APPROVED content, in the patient's language only (no
 * cross-language fallback — a missing translation is simply absent, matching the
 * content resolver's fail-closed rule), filtered to the patient's procedure. For
 * clinical education keys we additionally require the topic to be UNLOCKED for the
 * patient's recovery day, so the assistant can never surface later-stage advice
 * early. Safety strings (emergency.*) are excluded here — those are surfaced by
 * the deterministic guards, not quoted conversationally.
 *
 * This is the CLOSED SET: the agent is instructed to answer only from these
 * chunks, and the service records which keys grounded each reply. Deliberately
 * Mastra-free. Simple catalog retrieval (per the SP7 decision: keyword/catalog
 * first, embeddings only if recall proves poor).
 */
export async function fetchApprovedContentForAssistant(
  args: { procedureType: string; language: CatalogLanguage; recoveryDay: number },
  prisma?: PrismaClient,
): Promise<ApprovedContentChunk[]> {
  const p = prisma ?? db();
  const items = await p.contentItem.findMany({
    where: { status: ContentStatus.approved },
    select: {
      contentKey: true,
      category: true,
      translations: {
        where: { language: args.language, status: ContentStatus.approved },
        select: { text: true },
      },
    },
    orderBy: { contentKey: 'asc' },
  });

  const chunks: ApprovedContentChunk[] = [];
  for (const item of items) {
    // Never quote the emergency/safety strings conversationally.
    if (item.contentKey.startsWith('emergency.')) continue;
    if (!isKeyAvailableForProcedure(item.contentKey, args.procedureType)) continue;
    if (!isUnlockedForDay(item.contentKey, args.recoveryDay)) continue;
    const text = item.translations[0]?.text;
    if (!text) continue; // no approved translation in this language -> absent
    chunks.push({ contentKey: item.contentKey, category: item.category, text });
  }
  return chunks;
}

/** Clinical education keys `clinical.{proc}.day_{n}` unlock on their day n. */
function isUnlockedForDay(contentKey: string, recoveryDay: number): boolean {
  const m = contentKey.match(/\.day_(\d+)$/);
  if (!m) return true; // non-day-gated content is always available
  return recoveryDay >= Number(m[1]);
}

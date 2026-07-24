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

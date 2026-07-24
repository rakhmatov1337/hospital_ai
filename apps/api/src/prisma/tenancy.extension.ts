import { Prisma } from '@prisma/client';

/**
 * Models auto-scoped by a strict clinicId equality. ContentItem is deliberately
 * excluded: its clinic_id is nullable (global content), so scoping is handled
 * explicitly by the content resolver (SP1 T4) rather than by blanket injection.
 */
const CLINIC_SCOPED = new Set<string>([
  'Staff',
  'Patient',
  'RecoveryPlan',
  'EscalationRule',
  'Event',
  'AuditLog',
]);

/** Read/mutate operations that accept a general `where` filter. */
const WHERE_OPS = new Set<Prisma.PrismaAction>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * Tenancy client-extension: injects `where: { clinicId }` for clinic-scoped
 * models so a forgotten controller-level filter cannot leak across clinics.
 * Applied per request via PrismaService.forClinic(clinicId).
 *
 * findUnique/update/delete (by unique selector) are intentionally NOT auto-scoped
 * — callers use findFirst/updateMany for scoped access; a unique-by-id path is
 * validated at the service layer instead.
 */
export function tenancyExtension(clinicId: string) {
  return Prisma.defineExtension({
    name: 'tenancy',
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (
            CLINIC_SCOPED.has(model) &&
            WHERE_OPS.has(operation as Prisma.PrismaAction)
          ) {
            const scoped = {
              ...(args ?? {}),
              where: { ...((args ?? {}).where ?? {}), clinicId },
            };
            return query(scoped);
          }
          return query(args);
        },
      },
    },
  });
}

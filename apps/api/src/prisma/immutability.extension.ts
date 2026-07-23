import { Prisma, PrismaClient } from '@prisma/client';
import { ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';

/**
 * Fully append-only models: no update / updateMany / delete / deleteMany / upsert.
 * (Kept in sync with the comment block in prisma/schema.prisma.)
 */
export const APPEND_ONLY_MODELS: readonly Prisma.ModelName[] = [
  'Consent',
  'Escalation',
  'EscalationNotification',
  'Event',
];

const APPEND_ONLY = new Set<string>(APPEND_ONLY_MODELS);
const MUTATING = new Set<string>(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

/**
 * Prisma client extension enforcing immutability structurally. Applied to the
 * base client, so the guard is inherited by every forClinic()-derived client.
 *
 * - Append-only models throw on any mutation.
 * - ContentTranslation rows whose status = approved are frozen (edit => new draft
 *   version); draft rows stay mutable so the approval action itself can proceed.
 *
 * `base` is the UNEXTENDED client, used for the approved-row pre-check so the
 * check itself does not re-enter this guard.
 */
export function immutabilityExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'immutability',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model && MUTATING.has(operation)) {
            if (APPEND_ONLY.has(model)) {
              throw new AppError(
                ERROR_CODES.APPEND_ONLY_VIOLATION,
                `${model} is append-only; '${operation}' is not permitted.`,
                { model, operation },
              );
            }

            if (model === 'ContentTranslation') {
              const where =
                (args as { where?: Record<string, unknown> } | undefined)?.where ?? {};
              const approvedRow = await base.contentTranslation.findFirst({
                where: { ...where, status: 'approved' },
              });
              if (approvedRow) {
                throw new AppError(
                  ERROR_CODES.CONTENT_IMMUTABLE,
                  'Approved ContentTranslation rows are frozen; create a new draft version instead.',
                  { operation },
                );
              }
            }
          }

          return query(args);
        },
      },
    },
  });
}

import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { immutabilityExtension } from './immutability.extension';
import { tenancyExtension } from './tenancy.extension';

/**
 * Builds the guarded client: base PrismaClient + immutability guard + helper
 * methods (forClinic, lifecycle). Because Prisma 6 removed `$use` middleware,
 * immutability is a client extension and the guarded client itself is what we
 * inject — see PrismaService below.
 */
function createGuardedClient() {
  const base = new PrismaClient();
  return base
    .$extends(immutabilityExtension(base))
    .$extends({
      name: 'helpers',
      client: {
        /** Tenancy-scoped client bound to a clinic (immutability guard still applies). */
        forClinic(clinicId: string) {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            $extends: (ext: ReturnType<typeof tenancyExtension>) => unknown;
          };
          return ctx.$extends(tenancyExtension(clinicId));
        },
        async onModuleInit(): Promise<void> {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            $connect: () => Promise<void>;
          };
          await ctx.$connect();
        },
        async onModuleDestroy(): Promise<void> {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            $disconnect: () => Promise<void>;
          };
          await ctx.$disconnect();
        },
      },
    });
}

export type GuardedPrismaClient = ReturnType<typeof createGuardedClient>;
export type ScopedPrismaClient = ReturnType<GuardedPrismaClient['forClinic']>;

// TS base so PrismaService is typed as the fully-extended client (delegates + helpers).
const PrismaClientBase = class {} as unknown as new () => GuardedPrismaClient;

/**
 * The single Prisma client for the domain DB.
 *
 * The constructor RETURNS the guarded client, so the injected `PrismaService`
 * instance is the extended client itself:
 *   - `prisma.escalation.update(...)` throws (append-only guard),
 *   - `prisma.forClinic(clinicId)` returns a tenancy-scoped client.
 */
@Injectable()
export class PrismaService extends PrismaClientBase {
  constructor() {
    super();
    return createGuardedClient() as unknown as PrismaService;
  }
}

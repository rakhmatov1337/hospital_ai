import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { RequestContextData, TokenAudience } from '@hospital-ai/shared-types';

const KEY = 'requestContext';

/**
 * Per-request context backed by nestjs-cls (AsyncLocalStorage under the hood).
 * The auth layer (SP1 T2) populates this from the verified JWT; the Prisma
 * tenancy extension reads `clinicId` from here so a forgotten controller-level
 * filter cannot leak across clinics.
 */
@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService) {}

  private data(): RequestContextData {
    return this.cls.get<RequestContextData>(KEY) ?? {};
  }

  set(patch: Partial<RequestContextData>): void {
    this.cls.set(KEY, { ...this.data(), ...patch });
  }

  get clinicId(): string | undefined {
    return this.data().clinicId;
  }

  get audience(): TokenAudience | undefined {
    return this.data().audience;
  }

  get staffId(): string | undefined {
    return this.data().staffId;
  }

  get patientId(): string | undefined {
    return this.data().patientId;
  }

  /** Throws-free snapshot for logging/tests. */
  snapshot(): RequestContextData {
    return { ...this.data() };
  }

  /** clinicId or throw — used by tenancy-critical code paths. */
  requireClinicId(): string {
    const id = this.clinicId;
    if (!id) {
      throw new Error('RequestContext.clinicId is not set (no authenticated clinic in scope).');
    }
    return id;
  }
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestContext } from '../common/request-context';
import type { AuthenticatedRequest } from './guards';

/**
 * Lifts the verified principal that a JWT guard attached to the request into
 * the cls-backed RequestContext, so the Prisma tenancy extension (and any
 * service) can read clinicId / audience / ids without threading them manually.
 *
 * Runs after guards, within the same cls context established by ClsMiddleware,
 * so the values are visible to the route handler and every Prisma call it makes.
 * Routes without a guard simply have no principal and this is a no-op.
 */
@Injectable()
export class AuthContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContext: RequestContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = req.authPrincipal;

    if (principal) {
      this.requestContext.set({
        clinicId: principal.clinicId,
        audience: principal.audience,
        staffId: principal.staffId,
        patientId: principal.patientId,
      });
    }

    return next.handle();
  }
}

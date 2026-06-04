import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ROLES_KEY } from './auth.decorators';
import { JwtPayload } from './auth.types';
import { UserRole } from '../entities/user.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      req.user = this.jwt.verify<JwtPayload>(header.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const user: JwtPayload | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    if (!roles.includes(user.role)) {
      throw new ForbiddenException(`Requires role: ${roles.join(' | ')}`);
    }
    return true;
  }
}

// Fails fast if a hospital-scoped role somehow carries no hospitalId.
// SUPERADMIN is global and exempt. Services use req.user.hospitalId to scope.
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user: JwtPayload | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    if (user.role === 'SUPERADMIN') return true;
    if (!user.hospitalId) {
      throw new ForbiddenException('User is not bound to a hospital');
    }
    return true;
  }
}

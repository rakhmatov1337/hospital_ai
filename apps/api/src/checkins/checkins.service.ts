import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Check-in submission + tiering. Schema-backed skeleton; behaviour: SP2. */
@Injectable()
export class CheckinsService {
  constructor(private readonly prisma: PrismaService) {}
}

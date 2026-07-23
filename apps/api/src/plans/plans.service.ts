import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Recovery-plan template reads. Behaviour: SP1 T5/T6. */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}
}

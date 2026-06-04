import { Module, Injectable, NotFoundException } from '@nestjs/common';
import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from '../entities/alert.entity';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';

@Injectable()
class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
  ) {}

  listForDoctor(doctorId: string) {
    return this.alerts
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.patient', 'p')
      .where('p.doctorId = :doctorId', { doctorId })
      .orderBy('a.isRead', 'ASC')
      .addOrderBy('a.createdAt', 'DESC')
      .getMany();
  }

  async markRead(id: string) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    alert.isRead = true;
    return this.alerts.save(alert);
  }
}

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  @Roles('DOCTOR')
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listForDoctor(user.sub);
  }

  @Patch(':id/read')
  @Roles('DOCTOR')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Alert])],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}

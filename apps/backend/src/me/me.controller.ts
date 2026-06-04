import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MeService } from './me.service';
import { CompleteItemDto, CheckInDto } from './me.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';

@ApiTags('patient (me)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PATIENT')
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  private pid(user: JwtPayload): string {
    if (!user.patientId) throw new BadRequestException('Not a patient token');
    return user.patientId;
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.me.dashboard(this.pid(user));
  }

  @Get('checklist')
  checklist(@CurrentUser() user: JwtPayload, @Query('date') date?: string) {
    return this.me.checklist(this.pid(user), date);
  }

  @Patch('checklist/items/:id/complete')
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CompleteItemDto,
  ) {
    return this.me.completeItem(this.pid(user), id, dto);
  }

  @Get('medications')
  medications(@CurrentUser() user: JwtPayload, @Query('date') date?: string) {
    return this.me.medications(this.pid(user), date);
  }

  @Patch('medications/:id/taken')
  taken(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CompleteItemDto,
  ) {
    return this.me.completeItem(this.pid(user), id, dto);
  }

  @Get('diet')
  diet(@CurrentUser() user: JwtPayload) {
    return this.me.diet(this.pid(user));
  }

  @Get('profile')
  profile(@CurrentUser() user: JwtPayload) {
    return this.me.profile(this.pid(user));
  }

  @Post('check-in')
  checkIn(@CurrentUser() user: JwtPayload, @Body() dto: CheckInDto) {
    return this.me.createCheckIn(this.pid(user), dto);
  }
}

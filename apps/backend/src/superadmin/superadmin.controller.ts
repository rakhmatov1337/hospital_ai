import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SuperadminService } from './superadmin.service';
import type { UploadedDoc } from './superadmin.service';
import {
  CreateHospitalDto,
  CreateSurgeryTypeDto,
  UploadKbDto,
} from './superadmin.dto';
import { Hospital } from '../entities/hospital.entity';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { JwtPayload } from '../auth/auth.types';

@ApiTags('superadmin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPERADMIN')
@Controller()
export class SuperadminController {
  constructor(private readonly svc: SuperadminService) {}

  // ---- hospitals ----
  @Post('hospitals')
  createHospital(@CurrentUser() u: JwtPayload, @Body() dto: CreateHospitalDto) {
    return this.svc.createHospital(u.sub, dto);
  }

  @Get('hospitals')
  listHospitals() {
    return this.svc.listHospitals();
  }

  @Get('hospitals/:id')
  getHospital(@Param('id') id: string) {
    return this.svc.getHospital(id);
  }

  @Patch('hospitals/:id')
  updateHospital(@Param('id') id: string, @Body() patch: Partial<Hospital>) {
    return this.svc.updateHospital(id, patch);
  }

  // ---- surgery types ----
  @Get('surgery-types/all')
  listSurgeryTypes() {
    return this.svc.listSurgeryTypes();
  }

  @Post('surgery-types')
  createSurgeryType(@Body() dto: CreateSurgeryTypeDto) {
    return this.svc.createSurgeryType(dto);
  }

  // ---- KB documents (upload PDF/markdown to train the AI) ----
  @Post('kb/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadKb(
    @CurrentUser() u: JwtPayload,
    @UploadedFile() file: UploadedDoc,
    @Body() dto: UploadKbDto,
  ) {
    return this.svc.uploadKb(u.sub, file, dto);
  }

  @Get('kb/documents')
  listKb() {
    return this.svc.listKb();
  }

  @Get('kb/documents/:id')
  getKb(@Param('id') id: string) {
    return this.svc.getKb(id);
  }

  @Delete('kb/documents/:id')
  deleteKb(@Param('id') id: string) {
    return this.svc.deleteKb(id);
  }

  // ---- AI audit ----
  @Get('ai/interactions')
  interactions(@Query('limit') limit?: string) {
    return this.svc.listInteractions(limit ? Number(limit) : 50);
  }
}

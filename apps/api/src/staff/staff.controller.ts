import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StaffAccount } from '@hospital-ai/shared-types';
import { Audience, StaffJwtGuard } from '../auth/guards';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

/**
 * Staff-account administration API (D7). Every route requires an `aud:"staff"`
 * token; the clinic is taken from that token. Creating/updating accounts is
 * further restricted to a clinical lead (enforced in the service).
 */
@ApiTags('staff')
@Controller('staff')
@Audience('staff')
@UseGuards(StaffJwtGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @ApiOperation({ summary: "List the authenticated clinic's staff accounts." })
  @ApiOkResponse({ description: 'The clinic staff accounts (never the password hash).' })
  list(): Promise<StaffAccount[]> {
    return this.staffService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a staff account (clinical_lead only).' })
  @ApiCreatedResponse({ description: 'The created staff account.' })
  create(@Body() dto: CreateStaffDto): Promise<StaffAccount> {
    return this.staffService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a staff account (clinical_lead only).' })
  @ApiOkResponse({ description: 'The updated staff account.' })
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto): Promise<StaffAccount> {
    return this.staffService.update(id, dto);
  }
}

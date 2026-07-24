import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ContentActionResult,
  ContentItemDetail,
  ContentListItem,
  UnapprovedCountResult,
} from '@hospital-ai/shared-types';
import { Audience, StaffJwtGuard } from '../auth/guards';
import { ContentManagementService } from './content-management.service';
import { RequestChangesDto } from './dto/request-changes.dto';

/**
 * Staff content-approval API (D8). Every route requires an `aud:"staff"` token and
 * is clinic-scoped. Approve / request-changes are further gated to the clinical
 * lead (enforced in the service).
 *
 * REGISTRATION ORDER MATTERS: this controller is registered BEFORE the public
 * `GET /content/:key` resolver so the literal `GET /content/unapproved-count`
 * route matches ahead of the `:key` wildcard.
 */
@ApiTags('content')
@Controller('content')
@Audience('staff')
@UseGuards(StaffJwtGuard)
export class ContentManagementController {
  constructor(private readonly management: ContentManagementService) {}

  @Get()
  @ApiOperation({ summary: 'List all content items visible to the clinic with review state.' })
  @ApiOkResponse({ description: 'Content items (id, category, key, status, languages, last approver).' })
  list(): Promise<ContentListItem[]> {
    return this.management.list();
  }

  @Get('unapproved-count')
  @ApiOperation({ summary: 'Count of content items still needing approval (the launch blocker).' })
  @ApiOkResponse({ description: 'The unapproved-item count + total.' })
  unapprovedCount(): Promise<UnapprovedCountResult> {
    return this.management.unapprovedCount();
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'One content item: the three languages side by side + version history.' })
  @ApiOkResponse({ description: 'Full content-item detail.' })
  itemDetail(@Param('id') id: string): Promise<ContentItemDetail> {
    return this.management.itemDetail(id);
  }

  @Post('translations/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a translation (per item PER language; clinical_lead only).' })
  @ApiOkResponse({ description: 'The approved translation record.' })
  approve(@Param('id') id: string): Promise<ContentActionResult> {
    return this.management.approve(id);
  }

  @Post('translations/:id/request-changes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request changes to a translation → creates a new Draft version (clinical_lead only).' })
  @ApiOkResponse({ description: 'The new draft translation record.' })
  requestChanges(
    @Param('id') id: string,
    @Body() dto: RequestChangesDto,
  ): Promise<ContentActionResult> {
    return this.management.requestChanges(id, dto);
  }
}

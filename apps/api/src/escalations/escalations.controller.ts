import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audience, StaffJwtGuard } from '../auth/guards';
import {
  EscalationActionResult,
  EscalationDetail,
  EscalationQueue,
  EscalationsService,
} from './escalations.service';
import { ContactEscalationDto } from './dto/contact-escalation.dto';
import { ListEscalationsDto } from './dto/list-escalations.dto';

/**
 * Staff escalation API (SP2 spec §7 — powers dashboard D2/D3). Every route
 * requires an `aud:"staff"` token; the clinic is taken from that token
 * (RequestContext), never from the request. There is deliberately NO delete and
 * NO dismiss route — an escalation is only ever closed by recording an outcome.
 */
@ApiTags('escalations')
@Controller('escalations')
@Audience('staff')
@UseGuards(StaffJwtGuard)
export class EscalationsController {
  constructor(private readonly escalations: EscalationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'The staff queue: tier sections ordered tier-then-age. Never paginates or hides an unresolved item.',
  })
  @ApiOkResponse({ description: 'The escalation queue for the authenticated clinic.' })
  queue(@Query() query: ListEscalationsDto): Promise<EscalationQueue> {
    return this.escalations.queue(query.filter);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Escalation detail: patient, verbatim check-in answers, deciding rule, notification timeline, recent history.',
  })
  @ApiOkResponse({ description: 'Full escalation detail.' })
  detail(@Param('id') id: string): Promise<EscalationDetail> {
    return this.escalations.detail(id);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acknowledge an escalation (forward-only; halts the ladder; first-ack-wins).',
  })
  @ApiOkResponse({ description: 'The escalation, now acknowledged.' })
  acknowledge(@Param('id') id: string): Promise<EscalationActionResult> {
    return this.escalations.acknowledge(id);
  }

  @Post(':id/contact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record the patient-contact outcome (required) and close the escalation.',
  })
  @ApiOkResponse({ description: 'The escalation, now contacted with an outcome.' })
  contact(
    @Param('id') id: string,
    @Body() dto: ContactEscalationDto,
  ): Promise<EscalationActionResult> {
    return this.escalations.contact(id, dto);
  }
}

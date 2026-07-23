import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Audience, PatientJwtGuard } from '../auth/guards';
import { CheckinSubmissionResult, CheckinsService } from './checkins.service';
import { SubmitCheckinDto } from './dto/submit-checkin.dto';

/**
 * Patient-facing check-in API. Requires an `aud:"patient"` token; the patient and
 * clinic are taken from that token (RequestContext), never from the request body.
 *
 * The response is a content KEY (deterministic tier → key), never a judgment and
 * never model-generated text — the app routes to humans, it does not assess.
 */
@ApiTags('checkins')
@Controller('checkins')
@Audience('patient')
@UseGuards(PatientJwtGuard)
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  /**
   * Submit a daily check-in. The `Idempotency-Key` header is REQUIRED — an
   * offline-sync retry carries the same key and must yield a single check-in and,
   * for urgent/emergency, a single escalation.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a daily check-in (idempotent on Idempotency-Key).' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ description: 'Check-in accepted; tier + content key returned.' })
  submit(
    @Body() dto: SubmitCheckinDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<CheckinSubmissionResult> {
    return this.checkinsService.submit(dto, idempotencyKey);
  }
}

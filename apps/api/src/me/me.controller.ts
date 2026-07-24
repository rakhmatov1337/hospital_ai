import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Audience, PatientJwtGuard } from '../auth/guards';
import { ConsentDto } from './dto/consent.dto';
import { MeContentQueryDto } from './dto/content-query.dto';
import { LanguageDto } from './dto/language.dto';
import { SurveyDto } from './dto/survey.dto';
import {
  AppOpenedResult,
  CheckinQuestionView,
  ConsentResult,
  ContentResult,
  LanguageResult,
  LeaveResult,
  MeService,
  ProfileResult,
  ProgressResult,
  SurveyResult,
  TodayResult,
} from './me.service';

/**
 * Patient app ("me") API — the P1–P17 surface the Flutter app calls. Every route
 * requires an `aud:"patient"` token and is scoped to that token's `patientId`
 * (never a request-supplied id), so a patient can only ever read/write their own
 * data. Every response carries content KEYS + categorical/numeric values only —
 * the app resolves keys via `GET /v1/content/:key`.
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@Audience('patient')
@UseGuards(PatientJwtGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Post('consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record/confirm patient consent (P4): snapshots the approved consent text, activates the patient, and fires patient_enrolled exactly once (idempotent).',
  })
  @ApiOkResponse({ description: 'Consent recorded; patient active. Categorical fields only.' })
  consent(@Body() dto: ConsentDto): Promise<ConsentResult> {
    return this.me.consent(dto.version);
  }

  @Get('profile')
  @ApiOperation({
    summary:
      'Patient header + settings + clinic contact (P5/P16): firstName, recoveryDay, programmeDay (N of 30), language, procedureType and clinic name/phone/emergencyNumber/workingHours/workingDays.',
  })
  @ApiOkResponse({ description: 'The patient profile + clinic contact block.' })
  profile(): Promise<ProfileResult> {
    return this.me.profile();
  }

  @Get('today')
  @ApiOperation({
    summary:
      "Today's tasks + check-in prompt (P6–P8): today's tasks (id, taskType, contentRef KEY, scheduledFor, windowClosesAt, status, onTime) grouped by type, plus a checkinDue flag. Keys + categoricals only.",
  })
  @ApiOkResponse({ description: "Today's tasks grouped by type + checkinDue." })
  today(): Promise<TodayResult> {
    return this.me.today();
  }

  @Get('progress')
  @ApiOperation({
    summary:
      'My recovery (P9): adherence % (with numerator + denominator), daysCompleted/30, and the per-recovery-day completion series.',
  })
  @ApiOkResponse({ description: 'Adherence (denominated) + per-day completion series.' })
  progress(): Promise<ProgressResult> {
    return this.me.progress();
  }

  @Get('checkin/questions')
  @ApiOperation({
    summary:
      'Check-in form contract (P10): the structured CHECKIN_QUESTIONS as [{ ref, questionContentKey, type, options:[{code,label}] }]. Option labels come back in the patient\'s own language (EN/UZ/RU); the question text is a content key to resolve via GET /v1/content/:key. Submit via POST /v1/checkins.',
  })
  @ApiOkResponse({ description: 'The structured check-in question set.' })
  checkinQuestions(): Promise<CheckinQuestionView[]> {
    return this.me.checkinQuestions();
  }

  @Get('content')
  @ApiOperation({
    summary:
      "Learn (P14–P15): educational content KEYS unlocked for the patient's recovery day (unlocks day 1/3/5/7/14/21), with category + procedure. Resolve bodies via GET /v1/content/:key.",
  })
  @ApiQuery({ name: 'category', required: false, description: 'Content category (default: education).' })
  @ApiOkResponse({ description: 'Unlocked education content keys for the current recovery day.' })
  content(@Query() query: MeContentQueryDto): Promise<ContentResult> {
    return this.me.educationContent(query.category);
  }

  @Post('survey')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Day-30 survey (P17): stores the SurveyResponse (q1–q4 scores + free_text WRITE-ONLY, excluded from analytics), fires survey_submitted, allowed only near day 30. Idempotent.',
  })
  @ApiCreatedResponse({ description: 'Survey recorded. free_text is never returned.' })
  survey(@Body() dto: SurveyDto): Promise<SurveyResult> {
    return this.me.survey(dto);
  }

  @Patch('language')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change language (P16): updates the patient language instantly (any time) and fires language_changed.',
  })
  @ApiOkResponse({ description: 'The patient language, now updated.' })
  language(@Body() dto: LanguageDto): Promise<LanguageResult> {
    return this.me.language(dto.language);
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Leave programme (P16): patient self-withdraw — status withdrawn, stops future task/reminder generation, RETAINS all data, flags the clinic, fires patient_withdrawn.',
  })
  @ApiOkResponse({ description: 'The patient, now withdrawn; count of future tasks stopped.' })
  leave(): Promise<LeaveResult> {
    return this.me.leave();
  }

  @Post('app-opened')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Engagement telemetry: fires app_opened (categorical) — feeds the D6 engagement metric.' })
  @ApiOkResponse({ description: 'The app-open event was recorded.' })
  appOpened(): Promise<AppOpenedResult> {
    return this.me.appOpened();
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MeService } from './me.service';
import { CompleteItemDto, CheckInDto, ComplaintDto } from './me.dto';
import { ChatDto } from '../ai/chat/chat.dto';
import {
  createChatStream,
  logChatInteraction,
  chatHistory,
} from '../ai/chat/chat.service';
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

  // Anonymous complaint ("Anonim shikoyat")
  @Post('complaints')
  submitComplaint(@CurrentUser() user: JwtPayload, @Body() dto: ComplaintDto) {
    return this.me.createComplaint(this.pid(user), dto);
  }

  @Get('complaints')
  myComplaints(@CurrentUser() user: JwtPayload) {
    return this.me.listComplaints(this.pid(user));
  }

  @Get('chat/history')
  history(@CurrentUser() user: JwtPayload) {
    return chatHistory(this.pid(user));
  }

  // Streaming nurse chat over Server-Sent Events.
  @Post('chat')
  async chat(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    const patientId = this.pid(user);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const t0 = Date.now();
    const lastUser =
      [...dto.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    let full = '';
    let modelUsed = 'unknown';
    let fallbackUsed = false;

    try {
      const { stream, modelUsed: m } = await createChatStream({
        patientId,
        messages: dto.messages,
      });
      modelUsed = m;
      for await (const chunk of stream.textStream) {
        full += chunk;
        res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      }
    } catch {
      fallbackUsed = true;
      if (!full) {
        full =
          'I had trouble responding just now. Please try again, or contact your care team if it is urgent.';
        res.write(`data: ${JSON.stringify({ delta: full })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, modelUsed })}\n\n`);
    res.end();
    void logChatInteraction({
      patientId,
      input: lastUser,
      output: full,
      modelUsed,
      latencyMs: Date.now() - t0,
      fallbackUsed,
    });
  }
}

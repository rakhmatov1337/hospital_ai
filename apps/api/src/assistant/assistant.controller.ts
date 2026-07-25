import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Audience, PatientJwtGuard } from '../auth/guards';
import { AssistantService } from './assistant.service';
import { SendMessageDto } from './dto/send-message.dto';

/**
 * Patient Assistant API (SP7) — the grounded chat surface. `aud:"patient"`,
 * scoped to the token's patient. This is the product's ONLY model→patient
 * endpoint, and it is safe only because {@link AssistantService} wraps every
 * message in the deterministic input/output guards.
 *
 * `POST /v1/me/assistant/messages` streams the reply as Server-Sent-Events over
 * the POST response body (the Flutter client reads the chunked stream). Each line
 * is `data: {json}\n\n` where json is an AssistantChunk. The stream never emits an
 * unsafe sentence: the output guard withholds anything that trips the medical-
 * safety detector and ends with a `contentKey` the app resolves via
 * `GET /v1/content/:key`.
 */
@ApiTags('assistant')
@ApiBearerAuth()
@Controller('me/assistant')
@Audience('patient')
@UseGuards(PatientJwtGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('threads')
  @ApiOperation({ summary: 'List the patient\'s assistant conversations.' })
  @ApiOkResponse({ description: 'Threads, newest first.' })
  listThreads() {
    return this.assistant.listThreads();
  }

  @Post('threads')
  @ApiOperation({ summary: 'Start a new assistant conversation.' })
  createThread() {
    return this.assistant.createThread();
  }

  @Get('threads/:id')
  @ApiOperation({ summary: 'Message history for one conversation (to resume the UI).' })
  getThread(@Param('id') id: string) {
    return this.assistant.getThread(id);
  }

  @Post('messages')
  @ApiOperation({
    summary:
      'Send a message; streams the grounded reply as SSE. Emergency red-flag messages are answered from approved emergency content WITHOUT calling the model. Any judgment/dosing/diagnosis is withheld and replaced with a contact-clinic content key.',
  })
  @ApiProduces('text/event-stream')
  async sendMessage(@Body() dto: SendMessageDto, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const write = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    try {
      for await (const chunk of this.assistant.stream({ threadId: dto.threadId, message: dto.message })) {
        write(chunk);
      }
    } catch (err) {
      // Guardrail: never leak an internal message to the patient. The app shows
      // approved contact-clinic content on an error chunk.
      write({ type: 'error', code: 'INTERNAL_ERROR' });
    } finally {
      res.end();
    }
  }
}
